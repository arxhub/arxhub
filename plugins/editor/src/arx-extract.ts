import { type BlockType, type DocumentExtractor, type ExtractedBlock, type Extraction, isIntraVaultTarget, type ParsedRef } from '@arxhub/sql'

// Read structurally rather than through the editor's schema: the index is built while the kit may not be
// sealed yet, and a document a future editor version cannot open still has text worth finding.
interface ArxNode {
  type?: unknown
  attrs?: unknown
  text?: unknown
  marks?: unknown
  content?: unknown
}

type MarkLink = Omit<ParsedRef, 'srcBlock'>

// A container that holds blocks (a list, a callout) is opened rather than flattened into one row:
// `list-item` is a block type and `list` is not, so a two-item list is two blocks — the same result
// markdown gives. A quote is the other way round — one row carrying the text of the paragraphs inside it.
const BLOCK_TYPES: Record<string, BlockType> = {
  heading: 'heading',
  paragraph: 'paragraph',
  code_block: 'code',
  blockquote: 'quote',
  list_item: 'list-item',
  task_item: 'task',
}

const CONTAINERS = new Set([
  'bullet_list',
  'ordered_list',
  'task_list',
  'callout',
  'section',
  'table',
  'table_row',
  'table_cell',
  'columns',
  'column',
  'table_header',
])

// Entering one of these is a level deeper for the items inside it. A callout holds blocks but is not a
// list, so it opens without changing anyone's depth.
const LIST_CONTAINERS = new Set(['bullet_list', 'ordered_list', 'task_list'])

const IGNORED = new Set(['horizontal_rule'])

// `linkable`: a bare `[[link]]` may name an `.arx` document, as it could when the engine read the format.
export const ARX_EXTRACTOR: DocumentExtractor = {
  id: 'arx',
  kind: 'arx',
  version: 1,
  extensions: ['.arx'],
  linkable: true,
  extract: (input) => extractArx(input.text()),
}

// The search index's reading of an `.arx` file. A file that is not a readable tree is read as plain text
// rather than dropped: a file the editor cannot open is exactly the file its owner needs to find.
export function extractArx(text: string): Extraction {
  const children = documentChildren(text)
  if (children == null) return { kind: 'text', blocks: text.trim() === '' ? [] : [{ type: 'paragraph', content: text }] }

  const walk: Walk = { blocks: [], links: [] }
  const [first, ...rest] = children
  // Only the FIRST block is the document's properties — the same rule the editor's `ensureProperties`
  // enforces, so a properties-shaped node further down is not metadata.
  const isProperties = first != null && first.type === 'properties'
  for (const child of isProperties ? rest : children) appendNode(child, walk, 0)

  const extraction: Extraction = { blocks: walk.blocks, links: walk.links }
  return isProperties ? { ...extraction, ...readProperties(first) } : extraction
}

interface Walk {
  blocks: ExtractedBlock[]
  links: { blockIndex: number; ref: MarkLink }[]
}

function documentChildren(text: string): ArxNode[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (parsed == null || typeof parsed !== 'object') return null
  const root = 'doc' in parsed ? (parsed as { doc: unknown }).doc : parsed
  if (root == null || typeof root !== 'object') return null
  return childrenOf(root as ArxNode)
}

function readProperties(node: ArxNode): Pick<Extraction, 'tags' | 'favorite' | 'properties' | 'subject'> {
  const attrs = recordOf(node.attrs)
  const tags = Array.isArray(attrs.tags) ? attrs.tags.filter((tag): tag is string => typeof tag === 'string') : []
  const properties = Array.isArray(attrs.fields)
    ? attrs.fields
        .map(recordOf)
        .filter((field) => typeof field.key === 'string' && typeof field.value === 'string')
        .map((field) => ({ key: field.key as string, value: field.value as string }))
    : []
  // Set only on a card `<file>.arx` beside a non-`.arx` subject; a document's own block has none.
  const subject = attrs.subject != null && typeof attrs.subject === 'object' ? recordOf(attrs.subject) : null
  return {
    tags,
    favorite: attrs.favorite === true,
    properties,
    subject: subject == null ? null : { path: stringOrNull(subject.path), fileId: stringOrNull(subject.fileId) },
  }
}

function appendNode(node: ArxNode, walk: Walk, depth: number): void {
  const type = typeof node.type === 'string' ? node.type : ''
  if (IGNORED.has(type)) return

  if (CONTAINERS.has(type)) {
    const inner = LIST_CONTAINERS.has(type) ? depth + 1 : depth
    for (const child of childrenOf(node) ?? []) appendNode(child, walk, inner)
    return
  }

  const blockType = BLOCK_TYPES[type] ?? 'paragraph'
  const blockIndex = walk.blocks.length
  const { text, links } = readText(node, blockType === 'code')
  if (text.trim() !== '' || links.length > 0) {
    const id = blockArxId(node)
    walk.blocks.push({
      type: blockType,
      level: blockLevel(node, blockType, depth),
      checked: blockType === 'task' ? isChecked(node) : null,
      content: text,
      ...(id == null ? {} : { anchor: { id } }),
    })
    for (const ref of links) walk.links.push({ blockIndex, ref })
  }

  // A list item holds `paragraph block*` (editor-schema.ts), so a nested list sits INSIDE the item it
  // hangs off. Walked after the item, at the item's own depth which the container then bumps, the nested
  // items are rows of their own; read as part of the item's text they would be no rows at all.
  for (const child of childrenOf(node) ?? []) {
    if (isContainer(child)) appendNode(child, walk, depth)
  }
}

function isContainer(node: ArxNode): boolean {
  return typeof node.type === 'string' && CONTAINERS.has(node.type)
}

function isBlockNode(node: ArxNode): boolean {
  const type = typeof node.type === 'string' ? node.type : ''
  return BLOCK_TYPES[type] != null || CONTAINERS.has(type)
}

// A list item with no list around it (hand-written, or a format we do not know) still gets depth 1: it
// is at the top level, not outside every list.
function blockLevel(node: ArxNode, blockType: BlockType, depth: number): number | null {
  if (blockType === 'heading') return headingLevel(node)
  if (blockType !== 'list-item' && blockType !== 'task') return null
  return Math.max(depth, 1)
}

// The schema defaults `checked` to false, so a task whose attribute is missing is an unfinished one.
function isChecked(node: ArxNode): boolean {
  return recordOf(node.attrs).checked === true
}

// Stamped by block-identity.ts; a tree from before it existed simply has none, and the block still
// indexes by content alone.
function blockArxId(node: ArxNode): string | null {
  const id = recordOf(node.attrs).arxId
  return typeof id === 'string' && id !== '' ? id : null
}

function headingLevel(node: ArxNode): number {
  const level = recordOf(node.attrs).level
  const parsed = typeof level === 'number' ? Math.trunc(level) : Number.NaN
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 6) : 1
}

function childrenOf(node: ArxNode): ArxNode[] | null {
  if (!Array.isArray(node.content)) return null
  return node.content.filter((child): child is ArxNode => child != null && typeof child === 'object')
}

// `keepBreaks` is for code, where a newline is content; elsewhere a hard break reads as a space, the way
// markdown's soft line break does.
function readText(node: ArxNode, keepBreaks: boolean): { text: string; links: MarkLink[] } {
  const parts: string[] = []
  const links: MarkLink[] = []

  const visit = (current: ArxNode, top: boolean): void => {
    if (typeof current.text === 'string') {
      parts.push(current.text)
      const href = linkHref(current)
      if (href != null && isIntraVaultTarget(href)) {
        links.push({ kind: 'markdown', targetRaw: href, label: current.text.trim() === '' ? null : current.text.trim() })
      }
      return
    }
    if (current.type === 'hard_break') {
      parts.push(keepBreaks ? '\n' : ' ')
      return
    }
    for (const child of childrenOf(current) ?? []) {
      // The enumerations directly inside this block are appendNode's rows. Deeper down they are still
      // flattened: nothing else would emit them, and losing the text is worse than losing the shape.
      if (top && isContainer(child)) continue
      // Without a separator two paragraphs of a quote fuse into a token neither of their words matches.
      if (isBlockNode(child) && parts.length > 0) parts.push(keepBreaks ? '\n' : ' ')
      visit(child, false)
    }
  }

  visit(node, true)
  const text = parts.join('')
  return { text: keepBreaks ? text : text.replace(/\s+/g, ' ').trim(), links }
}

function linkHref(node: ArxNode): string | null {
  if (!Array.isArray(node.marks)) return null
  for (const mark of node.marks) {
    const { type, attrs } = recordOf(mark)
    if (type !== 'link') continue
    const href = recordOf(attrs).href
    if (typeof href === 'string' && href.trim() !== '') return href.trim()
  }
  return null
}

function recordOf(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
