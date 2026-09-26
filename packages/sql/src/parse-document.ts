import { posix } from '@arxhub/path'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import {
  BUILTIN_KINDS,
  blockId,
  builtinKind,
  type DocumentKind,
  documentDir,
  documentExtension,
  documentPath,
  type FileStat,
  foldText,
  type ParsedBlock,
  type ParsedDocument,
  type ParsedRef,
  type ParsedTag,
} from './document'
import { type DocumentExtractor, type Extraction, extractorKind, matchingExtractors } from './extractor'
import { frontmatterTags, frontmatterTitle, splitFrontmatter } from './frontmatter'
import { parseMarkdownBlocks } from './markdown'
import { dedupeRefs, extractRefs, extractTags } from './markup'

const decoder = new TextDecoder('utf-8')

export interface AssembleOptions {
  // False for a format whose text is data (a cell, a PDF page): no `#tag` or `[[ref]]` is read out of it.
  inlineMarkup?: boolean
}

// One file to one index record with the built-in rules only — markdown, text, binary. Pure and
// synchronous: it takes bytes and gives back rows, so every rule is a unit test rather than a database
// round trip.
export function parseDocument(pathname: string, bytes: Uint8Array, stat?: Partial<FileStat>): ParsedDocument {
  const path = documentPath(pathname)
  const kind = builtinKind(path)

  // A file whose content the product cannot read is indexed by its metadata alone (FR-221): no blocks,
  // no text. Its bytes are still hashed, so a walk can tell it apart from a new version of itself.
  if (kind === BUILTIN_KINDS.binary) {
    return { ...emptyRecord(path, kind, stat, bytes.length), hash: sha256(bytes) }
  }

  const text = decodeText(bytes)
  const extraction = kind === BUILTIN_KINDS.markdown ? markdownExtraction(text) : textExtraction(text)
  return assembleDocument(path, kind, extraction, bytes, stat)
}

// A registered extractor first, in registration order, each free to decline; the built-in rule when
// every one of them did. A throw is not a decline — it propagates, and the caller indexes the file by its
// metadata, the same as a built-in parse that failed.
export async function extractDocument(
  pathname: string,
  bytes: Uint8Array,
  stat: Partial<FileStat> | undefined,
  extractors: readonly DocumentExtractor[],
): Promise<ParsedDocument> {
  const path = documentPath(pathname)
  const candidates = matchingExtractors(path, extractors)
  if (candidates.length === 0) return parseDocument(path, bytes, stat)

  let decoded: string | null = null
  const input = {
    path,
    bytes,
    stat: statFields(stat, bytes.length),
    text: (): string => {
      decoded ??= decodeText(bytes)
      return decoded
    },
  }
  for (const extractor of candidates) {
    const extraction = await extractor.extract(input)
    if (extraction == null) continue
    return assembleDocument(path, extraction.kind ?? extractorKind(extractor), extraction, bytes, stat, {
      inlineMarkup: extractor.inlineMarkup ?? true,
    })
  }
  return parseDocument(path, bytes, stat)
}

// An extraction to the rows of the index: block ids and ordinals, occurrences, tags, refs and the title
// are computed here, once, for every format — so an extractor states what its file says and never how
// the index keys it.
export function assembleDocument(
  pathname: string,
  kind: DocumentKind,
  extraction: Extraction,
  bytes: Uint8Array,
  stat?: Partial<FileStat>,
  options: AssembleOptions = {},
): ParsedDocument {
  const path = documentPath(pathname)
  const inlineMarkup = options.inlineMarkup ?? true

  // How many earlier blocks already had this exact content — computed here, in parse order, once per
  // document: a query would need a self-join per row, and the answer never changes after the parse.
  const seenContent = new Map<string, number>()
  const blocks: ParsedBlock[] = extraction.blocks.map((block, ordinal) => {
    const occurrence = seenContent.get(block.content) ?? 0
    seenContent.set(block.content, occurrence + 1)
    return {
      id: blockId(path, ordinal),
      ordinal,
      type: block.type,
      level: block.level ?? null,
      // Only a task has a state to be in; a stray flag on another type would answer a question nobody asked.
      checked: block.type === 'task' ? (block.checked ?? false) : null,
      anchorId: nonEmpty(block.anchor?.id),
      part: nonEmpty(block.anchor?.part),
      occurrence,
      content: block.content,
    }
  })

  const title = resolveTitle(path, extraction.title ?? null, blocks)

  return {
    path,
    name: posix.basename(path),
    dir: documentDir(path),
    ext: documentExtension(path),
    kind,
    title,
    titleFold: foldText(title),
    // The full-text search over a document runs on this field, so it is the blocks' text and nothing
    // else — the markup was already taken out of each block.
    content: blocks.map((block) => block.content).join('\n'),
    frontmatter: extraction.frontmatter ?? null,
    ...statFields(stat, bytes.length),
    hash: sha256(bytes),
    blocks,
    tags: collectTags(extraction, blocks, inlineMarkup),
    refs: collectRefs(extraction, blocks, inlineMarkup),
    favorite: extraction.favorite ?? false,
    properties: extraction.properties?.map((property) => ({ key: property.key, value: property.value })) ?? [],
    subjectPath: extraction.subject?.path ?? null,
    subjectFileId: extraction.subject?.fileId ?? null,
  }
}

// The record for a file that is in the index but was not read: too large to parse, or a parse that
// failed. Metadata only, so the file is still found by name and still swept when it disappears.
export function metadataDocument(pathname: string, stat?: Partial<FileStat>, kind?: DocumentKind): ParsedDocument {
  const path = documentPath(pathname)
  return emptyRecord(path, kind ?? builtinKind(path), stat, 0)
}

function markdownExtraction(text: string): Extraction {
  const { frontmatter, body } = splitFrontmatter(text)
  return {
    title: frontmatterTitle(frontmatter),
    blocks: parseMarkdownBlocks(body),
    tags: frontmatterTags(frontmatter),
    frontmatter,
  }
}

function textExtraction(text: string): Extraction {
  return { blocks: text.trim() === '' ? [] : [{ type: 'paragraph', content: text }] }
}

function emptyRecord(path: string, kind: DocumentKind, stat: Partial<FileStat> | undefined, byteLength: number): ParsedDocument {
  const title = filenameTitle(path)
  return {
    path,
    name: posix.basename(path),
    dir: documentDir(path),
    ext: documentExtension(path),
    kind,
    title,
    titleFold: foldText(title),
    content: '',
    frontmatter: null,
    ...statFields(stat, byteLength),
    hash: null,
    blocks: [],
    tags: [],
    refs: [],
    favorite: false,
    properties: [],
    subjectPath: null,
    subjectFileId: null,
  }
}

// An explicit title first (metadata), then the first heading of the content, then the file name — and
// never empty (FR-220).
function resolveTitle(path: string, explicit: string | null, blocks: readonly ParsedBlock[]): string {
  if (explicit != null && explicit.trim() !== '') return explicit
  const heading = blocks.find((block) => block.type === 'heading' && block.content.trim() !== '')
  if (heading != null) return heading.content.trim()
  return filenameTitle(path)
}

function filenameTitle(path: string): string {
  const name = posix.basename(path)
  const ext = posix.extname(name)
  const stem = ext === '' ? name : name.slice(0, -ext.length)
  // A file called `.gitignore` has no stem — its own name is the only honest title.
  return stem === '' ? name : stem
}

function collectTags(extraction: Extraction, blocks: readonly ParsedBlock[], inlineMarkup: boolean): ParsedTag[] {
  const tags: ParsedTag[] = []
  const seen = new Set<string>()

  const push = (name: string, block: string | null): void => {
    const nameFold = foldText(name)
    // The unique index is (doc_path, name_fold, block_id): the same tag twice in one block is one row.
    const key = `${block ?? ''} ${nameFold}`
    if (nameFold === '' || seen.has(key)) return
    seen.add(key)
    tags.push({ name, nameFold, blockId: block })
  }

  // Document-level tags (frontmatter, a `properties` block) are metadata — never read from text, so a
  // `#word` inside a note's own prose stays apart from a tag the owner attached.
  for (const name of extraction.tags ?? []) push(name, null)
  if (!inlineMarkup) return tags
  for (const block of blocks) {
    // Code keeps its markers, so `#include` in a C snippet is not a tag.
    if (block.type === 'code') continue
    for (const name of extractTags(block.content)) push(name, block.id)
  }
  return tags
}

function collectRefs(extraction: Extraction, blocks: readonly ParsedBlock[], inlineMarkup: boolean): ParsedRef[] {
  const refs: ParsedRef[] = []
  if (inlineMarkup) {
    for (const [ordinal, block] of blocks.entries()) {
      if (block.type === 'code') continue
      const source = extraction.blocks[ordinal]
      refs.push(...extractRefs(source.raw ?? source.content, block.id))
    }
  }
  for (const { blockIndex, ref } of extraction.links ?? []) {
    const block = blocks[blockIndex]
    if (block == null || block.type === 'code') continue
    refs.push({ ...ref, srcBlock: block.id })
  }
  return dedupeRefs(refs)
}

function statFields(stat: Partial<FileStat> | undefined, byteLength: number): FileStat {
  return {
    // bigint columns take integers: a fractional millisecond from a filesystem that reports one would
    // be rejected by the DBMS rather than rounded.
    size: integer(stat?.size, byteLength),
    mtime: integer(stat?.mtime, 0),
    ctime: integer(stat?.ctime, 0),
  }
}

function integer(value: number | undefined, fallback: number): number {
  return value == null || !Number.isFinite(value) ? fallback : Math.trunc(value)
}

function nonEmpty(value: string | undefined): string | null {
  return value == null || value === '' ? null : value
}

function decodeText(bytes: Uint8Array): string {
  const text = decoder.decode(bytes)
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}
