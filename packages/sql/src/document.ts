import { normalizePath, posix } from '@arxhub/path'

// How the content of a file was read. Stored as text rather than an enum type: a new parser adds a
// value without a type migration (see db/client/tables/document.dbml).
export type DocumentKind = 'markdown' | 'arx' | 'text' | 'binary'

// The block vocabulary of the first release. Tables are still absent — no parser produces one, and a
// block type nothing produces is a column nobody can query. `task` is separate from `list-item` rather
// than a flag on it (A-28): "what is still open" is the question tasks are indexed for, and it must not
// have to know that a task is a kind of list item first. Only the `.arx` reader produces one — see
// A-29 in the decisions register: `.arx` is the format the product reasons about, markdown is read for
// its text and its rough shape and nothing more.
export type BlockType = 'heading' | 'paragraph' | 'list-item' | 'task' | 'code' | 'quote'

export type RefKind = 'wikilink' | 'markdown'

// Extensions that make a document out of a file, in the order a link without one is resolved against
// them. `text`/`markdown`/`arx` — everything else is metadata only.
export const MARKDOWN_EXTENSIONS = ['md', 'markdown'] as const
export const ARX_EXTENSIONS = ['arx'] as const
export const TEXT_EXTENSIONS = ['txt', 'text'] as const
export const DOCUMENT_EXTENSIONS = [...MARKDOWN_EXTENSIONS, ...ARX_EXTENSIONS, ...TEXT_EXTENSIONS] as const

export interface ParsedBlock {
  // `<document path>#<ordinal>` — composite, and only stable within one version of the document.
  id: string
  ordinal: number
  type: BlockType
  // Heading depth for a heading, nesting depth for an `.arx` list item or task, null for everything
  // else — markdown's list items included. One column for both because it is the same question — how
  // deep this block sits — and the type beside it already says which scale to read it on.
  level: number | null
  // Whether a task is done. Null for every other block type, the way `level` is: a plain list item has
  // no state to be in, and a `false` there would answer "not done" to a question nobody asked.
  checked: boolean | null
  // The `.arx` block's own stable id (block-identity.ts); null for markdown and text.
  arxId: string | null
  // How many earlier blocks of this document already had this exact content, 0 for the first — the
  // fallback anchor for a format with no block identity (markdown).
  occurrence: number
  content: string
}

export interface ParsedTag {
  name: string
  nameFold: string
  // The block the tag was written in; null for a tag that came from the document's metadata.
  blockId: string | null
}

// A key/value field from an `.arx` document's `properties` block (A-48). The block itself never becomes
// a row of `block` (it carries no text) — this is the whole of what it contributes to the index besides
// its tags (folded into `tag`, the same as frontmatter's) and `document.favorite`/`subject_*`.
export interface ParsedProperty {
  key: string
  value: string
}

export interface ParsedRef {
  kind: RefKind
  targetRaw: string
  label: string | null
  srcBlock: string | null
}

// What the walk learned about the file from the filesystem, before reading it.
export interface FileStat {
  size: number
  mtime: number
  ctime: number
}

export interface ParsedDocument {
  path: string
  name: string
  dir: string
  ext: string
  kind: DocumentKind
  title: string
  titleFold: string
  content: string
  frontmatter: Record<string, unknown> | null
  size: number
  mtime: number
  ctime: number
  hash: string | null
  blocks: ParsedBlock[]
  tags: ParsedTag[]
  refs: ParsedRef[]
  // From the document's own `properties` block, when it has one (A-48) — false/null/[] otherwise, never
  // absent, so a writer never has to ask "does this document have properties" before writing the row.
  favorite: boolean
  properties: ParsedProperty[]
  // Set only when this document is a `<file>.arx` card: the non-`.arx` file it is about, by path (for
  // readability) and by `fileId` from the sync manifest (survives a rename) when the file has one.
  subjectPath: string | null
  subjectFileId: string | null
}

// Lower-cased with the diacritics folded away — what `similarity()` compares (FR-230) and what the
// `tag:` qualifier matches (FR-231). Mirrors Postgres' `unaccent` in TypeScript so the stored column
// and a query written against it agree: NFD splits a letter from its combining marks, and dropping the
// marks leaves the base letter.
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFC')
    .toLowerCase()
}

// Path inside the content store, no leading slash and always '/'-separated — the primary key of
// `document`.
export function documentPath(pathname: string): string {
  // posix.normalize already drops a './' prefix; '.' is what an empty path normalizes to. Slicing a
  // leading dot by hand would turn a dotfile ('.gitignore') into a different name.
  const normalized = posix.normalize(normalizePath(pathname))
  return normalized === '.' ? '' : normalized
}

export function documentExtension(pathname: string): string {
  return posix.extname(posix.basename(pathname)).replace(/^\./, '').toLowerCase()
}

export function documentDir(pathname: string): string {
  const dir = posix.dirname(documentPath(pathname))
  return dir === '.' || dir === '/' ? '' : dir
}

export function detectDocumentKind(pathname: string): DocumentKind {
  const ext = documentExtension(pathname)
  if ((MARKDOWN_EXTENSIONS as readonly string[]).includes(ext)) return 'markdown'
  if ((ARX_EXTENSIONS as readonly string[]).includes(ext)) return 'arx'
  // A file with no extension is read as text: a README or a LICENSE is prose, and refusing to look
  // inside it would hide it from search for a reason the owner cannot see.
  if (ext === '' || (TEXT_EXTENSIONS as readonly string[]).includes(ext)) return 'text'
  return 'binary'
}

export function blockId(path: string, ordinal: number): string {
  return `${path}#${ordinal}`
}
