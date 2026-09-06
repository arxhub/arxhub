import { posix } from '@arxhub/path'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { parseArx } from './arx'
import {
  blockId,
  type DocumentKind,
  detectDocumentKind,
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
import { frontmatterTags, frontmatterTitle, splitFrontmatter } from './frontmatter'
import { parseMarkdownBlocks, type SourceBlock } from './markdown'
import { dedupeRefs, extractRefs, extractTags } from './markup'

const decoder = new TextDecoder('utf-8')

// One file to one index record: the document row plus its blocks, tags and links. Pure — it takes bytes
// and gives back rows, so every rule below is a unit test rather than a database round trip.
export function parseDocument(pathname: string, bytes: Uint8Array, stat?: Partial<FileStat>): ParsedDocument {
  const path = documentPath(pathname)
  const kind = detectDocumentKind(path)

  // A file whose content the product cannot read is indexed by its metadata alone (FR-221): no blocks,
  // no text. Its bytes are still hashed, so a walk can tell it apart from a new version of itself.
  if (kind === 'binary') {
    return { ...emptyRecord(path, 'binary', stat, bytes.length), hash: sha256(bytes) }
  }

  const text = stripBom(decoder.decode(bytes))
  const source = readSource(kind, text)

  const blocks: ParsedBlock[] = source.blocks.map((block, ordinal) => ({
    id: blockId(path, ordinal),
    ordinal,
    type: block.type,
    level: block.level,
    checked: block.checked,
    content: block.content,
  }))

  const tags = collectTags(source, blocks)
  const refs = collectRefs(source, blocks)
  const title = resolveTitle(path, source.frontmatterTitle, blocks)

  return {
    path,
    name: posix.basename(path),
    dir: documentDir(path),
    ext: documentExtension(path),
    kind: source.kind,
    title,
    titleFold: foldText(title),
    // The full-text search over a document runs on this field, so it is the blocks' text and nothing
    // else — the markup was already taken out of each block.
    content: blocks.map((block) => block.content).join('\n'),
    frontmatter: source.frontmatter,
    ...statFields(stat, bytes.length),
    hash: sha256(bytes),
    blocks,
    tags,
    refs,
  }
}

// The record for a file that is in the index but was not read: too large to parse, or a parse that
// failed. Metadata only, so the file is still found by name and still swept when it disappears.
export function metadataDocument(pathname: string, stat?: Partial<FileStat>, kind?: DocumentKind): ParsedDocument {
  const path = documentPath(pathname)
  return emptyRecord(path, kind ?? detectDocumentKind(path), stat, 0)
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
  }
}

interface DocumentSource {
  kind: DocumentKind
  blocks: SourceBlock[]
  frontmatter: Record<string, unknown> | null
  frontmatterTitle: string | null
  frontmatterTags: string[]
  // Links the format carried structurally (an `.arx` link mark), by block index — a block's text has no
  // link syntax left in it, so they cannot be read back out of it.
  markLinks: { blockIndex: number; ref: Omit<ParsedRef, 'srcBlock'> }[]
}

function readSource(kind: DocumentKind, text: string): DocumentSource {
  if (kind === 'markdown') {
    const { frontmatter, body } = splitFrontmatter(text)
    return {
      kind,
      blocks: parseMarkdownBlocks(body),
      frontmatter,
      frontmatterTitle: frontmatterTitle(frontmatter),
      frontmatterTags: frontmatterTags(frontmatter),
      markLinks: [],
    }
  }

  if (kind === 'arx') {
    const parsed = parseArx(text)
    // Not a readable tree: read it as plain text instead of dropping it. A file the editor cannot open
    // is exactly the file its owner needs to find.
    if (parsed == null) return textSource(text)
    return { kind, blocks: parsed.blocks, frontmatter: null, frontmatterTitle: null, frontmatterTags: [], markLinks: parsed.markLinks }
  }

  return textSource(text)
}

function textSource(text: string): DocumentSource {
  const blocks: SourceBlock[] = text.trim() === '' ? [] : [{ type: 'paragraph', level: null, checked: null, raw: text, content: text }]
  return { kind: 'text', blocks, frontmatter: null, frontmatterTitle: null, frontmatterTags: [], markLinks: [] }
}

// Metadata first, then the first heading of the content, then the file name — and never empty (FR-220).
function resolveTitle(path: string, fromFrontmatter: string | null, blocks: readonly ParsedBlock[]): string {
  if (fromFrontmatter != null) return fromFrontmatter
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

function collectTags(source: DocumentSource, blocks: readonly ParsedBlock[]): ParsedTag[] {
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

  for (const name of source.frontmatterTags) push(name, null)
  for (const block of blocks) {
    // Code keeps its markers, so `#include` in a C snippet is not a tag.
    if (block.type === 'code') continue
    for (const name of extractTags(block.content)) push(name, block.id)
  }
  return tags
}

function collectRefs(source: DocumentSource, blocks: readonly ParsedBlock[]): ParsedRef[] {
  const refs: ParsedRef[] = []
  for (const [ordinal, block] of blocks.entries()) {
    if (block.type === 'code') continue
    refs.push(...extractRefs(source.blocks[ordinal].raw, block.id))
  }
  for (const { blockIndex, ref } of source.markLinks) {
    const block = blocks[blockIndex]
    if (block == null) continue
    refs.push({ ...ref, srcBlock: block.id })
  }
  return dedupeRefs(refs)
}

function statFields(stat: Partial<FileStat> | undefined, byteLength: number): Pick<ParsedDocument, 'size' | 'mtime' | 'ctime'> {
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

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}
