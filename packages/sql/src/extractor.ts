import {
  type BlockType,
  documentExtension,
  type FileStat,
  MARKDOWN_EXTENSIONS,
  type ParsedProperty,
  type ParsedRef,
  TEXT_EXTENSIONS,
} from './document'

// What an extractor is handed for one file. `text()` is lazy because a binary format (a PDF) never
// wants the bytes decoded as UTF-8, and decoding a large file for nothing is a full pass over it.
export interface ExtractInput {
  path: string
  bytes: Uint8Array
  text(): string
  stat: FileStat
}

// Where inside the object a block lives, in the owner's own terms. Two fields rather than one because a
// composite object needs both: a spreadsheet hit is a cell (`id`) of a worksheet (`part`), a PDF hit is
// only a page (`part`), an `.arx` hit is only a block (`id`).
export interface ExtractedAnchor {
  id?: string
  part?: string
}

export interface ExtractedBlock {
  type: BlockType
  content: string
  // The text with its markup still in it, where refs are read from; `content` when absent.
  raw?: string
  level?: number | null
  checked?: boolean | null
  anchor?: ExtractedAnchor
}

export interface Extraction {
  // Overrides the registration's kind — an owner that falls back to reading its file as plain text says
  // so, rather than claiming a structure it did not find.
  kind?: string
  title?: string | null
  blocks: ExtractedBlock[]
  // Links a format carries structurally (an `.arx` link mark): a block's text has no link syntax left in
  // it, so these cannot be read back out of `raw`.
  links?: { blockIndex: number; ref: Omit<ParsedRef, 'srcBlock'> }[]
  tags?: string[]
  favorite?: boolean
  properties?: ParsedProperty[]
  subject?: { path: string | null; fileId: string | null } | null
  frontmatter?: Record<string, unknown> | null
}

// A format owner's reading rule. The engine knows markdown and text; every other format is contributed
// by the plugin that owns it, so the index never has to learn a format's structure second-hand.
export interface DocumentExtractor {
  id: string
  // Written to `document.kind`; the id when absent.
  kind?: string
  // Bumped by the owner whenever its output changes. It is part of the signature the index is built
  // under, and a row whose size and mtime still match is otherwise never read again.
  version: number
  // With the dot, lower case: '.arx'.
  extensions: readonly string[]
  matches?(path: string): boolean
  // Whether a bare `[[link]]` may mean a file of this format.
  linkable?: boolean
  // False for formats whose text is data rather than prose (a cell, a PDF page): a `#` there is not a
  // tag and brackets are not a link.
  inlineMarkup?: boolean
  // null declines, and the next matching extractor (then the built-in rule) reads the file instead.
  extract(input: ExtractInput): Extraction | null | Promise<Extraction | null>
}

// Every extractor that claims the path, in registration order — the decline chain.
export function matchingExtractors(path: string, extractors: readonly DocumentExtractor[]): DocumentExtractor[] {
  const ext = extensionOf(path)
  if (ext === '') return []
  return extractors.filter((extractor) => claims(extractor, ext) && (extractor.matches?.(path) ?? true))
}

export function resolveExtractor(path: string, extractors: readonly DocumentExtractor[]): DocumentExtractor | null {
  return matchingExtractors(path, extractors)[0] ?? null
}

export function extractorKind(extractor: DocumentExtractor): string {
  return extractor.kind ?? extractor.id
}

// Sorted by id so the order plugins happened to configure in does not read as a change of the set.
export function extractorSignature(extractors: readonly DocumentExtractor[]): string {
  return [...extractors]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((extractor) => `${extractor.id}@${extractor.version}:${[...extractor.extensions].map(normalizeExtension).sort().join(',')}`)
    .join(';')
}

// The extensions a link written without one is tried against, in order: markdown first (the common case
// and the historic one), then the linkable contributed formats, then plain text.
export function linkExtensions(extractors: readonly DocumentExtractor[]): string[] {
  const result: string[] = [...MARKDOWN_EXTENSIONS]
  for (const extractor of extractors) {
    if (extractor.linkable !== true) continue
    for (const ext of extractor.extensions) {
      const bare = normalizeExtension(ext).replace(/^\./, '')
      if (bare !== '' && !result.includes(bare)) result.push(bare)
    }
  }
  for (const ext of TEXT_EXTENSIONS) if (!result.includes(ext)) result.push(ext)
  return result
}

function claims(extractor: DocumentExtractor, ext: string): boolean {
  return extractor.extensions.some((it) => normalizeExtension(it) === ext)
}

function normalizeExtension(ext: string): string {
  const lower = ext.trim().toLowerCase()
  return lower.startsWith('.') ? lower : `.${lower}`
}

function extensionOf(path: string): string {
  const ext = documentExtension(path)
  return ext === '' ? '' : `.${ext}`
}
