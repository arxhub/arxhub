import type { BlockType, ParsedRef } from './document'
import type { SourceBlock } from './markdown'
import { isIntraVaultTarget } from './markup'

// The product's own format: `{ version, doc }` where `doc` is the document tree (see
// plugins/editor/src/editor-format.ts). Read structurally rather than through the editor's schema —
// the engine must not depend on the editor, and a tree it does not recognise still has text in it.
interface ArxNode {
  type?: unknown
  attrs?: unknown
  text?: unknown
  marks?: unknown
  content?: unknown
}

// Node type of the tree to the block vocabulary of the index. A container that holds blocks (a list, a
// callout) is opened rather than flattened into one row: `list-item` is a block type and `list` is not,
// so a two-item list is two blocks — the same result markdown gives. A quote is the other way round —
// one row carrying the text of the paragraphs inside it.
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

// The containers that nest: entering one is a level deeper for the items inside it. A callout holds
// blocks but is not a list, so it opens without changing anyone's depth.
const LIST_CONTAINERS = new Set(['bullet_list', 'ordered_list', 'task_list'])

// Nodes that carry no text and become no block.
const IGNORED = new Set(['horizontal_rule'])

export interface ArxParse {
  blocks: SourceBlock[]
  // Links carried by the tree's own link marks, keyed by the block index they were found in. A block's
  // text has no brackets left in it, so these cannot be read back out of `content` later.
  markLinks: { blockIndex: number; ref: Omit<ParsedRef, 'srcBlock'> }[]
}

// Reads an `.arx` file. Returns null when the file is not a readable tree — the caller then indexes it
// as text, because an unreadable file must still be findable by name rather than drop out of the index.
export function parseArx(text: string): ArxParse | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (parsed == null || typeof parsed !== 'object') return null

  const root = 'doc' in parsed ? (parsed as { doc: unknown }).doc : parsed
  if (root == null || typeof root !== 'object') return null

  const children = childrenOf(root as ArxNode)
  if (children == null) return null

  const result: ArxParse = { blocks: [], markLinks: [] }
  for (const child of children) {
    appendNode(child, result, 0)
  }
  return result
}

function appendNode(node: ArxNode, result: ArxParse, depth: number): void {
  const type = typeof node.type === 'string' ? node.type : ''
  if (IGNORED.has(type)) return

  if (CONTAINERS.has(type)) {
    const inner = LIST_CONTAINERS.has(type) ? depth + 1 : depth
    for (const child of childrenOf(node) ?? []) {
      appendNode(child, result, inner)
    }
    return
  }

  const blockType = BLOCK_TYPES[type] ?? 'paragraph'
  const blockIndex = result.blocks.length
  const { text, links } = readText(node, blockType === 'code')
  if (text.trim() !== '' || links.length > 0) {
    result.blocks.push({
      type: blockType,
      level: blockLevel(node, blockType, depth),
      checked: blockType === 'task' ? isChecked(node) : null,
      arxId: blockArxId(node),
      raw: text,
      content: text,
    })
    for (const link of links) {
      result.markLinks.push({ blockIndex, ref: link })
    }
  }

  // A list item holds `paragraph block*` (plugins/editor/src/editor-schema.ts), so a nested list sits
  // INSIDE the item it hangs off rather than beside it. Walked after the item — and at the item's own
  // depth, which the container then bumps — the nested items are rows of their own; read as part of the
  // item's text they would be no rows at all, and `level` could never exceed 1.
  for (const child of childrenOf(node) ?? []) {
    if (isContainer(child)) appendNode(child, result, depth)
  }
}

function isContainer(node: ArxNode): boolean {
  return typeof node.type === 'string' && CONTAINERS.has(node.type)
}

// A node the walk gives a row of its own: everything readText must not fuse into the text around it.
function isBlockNode(node: ArxNode): boolean {
  const type = typeof node.type === 'string' ? node.type : ''
  return BLOCK_TYPES[type] != null || CONTAINERS.has(type)
}

// A tree that nests a list item without a list around it (hand-written, or a format we do not know)
// still gets depth 1 rather than 0: the item is at the top level, not outside every list.
function blockLevel(node: ArxNode, blockType: BlockType, depth: number): number | null {
  if (blockType === 'heading') return headingLevel(node)
  if (blockType !== 'list-item' && blockType !== 'task') return null
  return Math.max(depth, 1)
}

// The editor's task_item declares `checked` with a default of false, so a task whose attribute is
// missing is an unfinished one — not a task with nothing to say about its state.
function isChecked(node: ArxNode): boolean {
  const attrs = node.attrs
  if (attrs == null || typeof attrs !== 'object' || !('checked' in attrs)) return false
  return (attrs as { checked: unknown }).checked === true
}

// The block's own identity, stamped on every non-inline node by plugins/editor/src/block-identity.ts.
// A tree from before that plugin existed, or a node the identity pass never reached, simply has none —
// the block still indexes, by content alone.
function blockArxId(node: ArxNode): string | null {
  const attrs = node.attrs
  if (attrs == null || typeof attrs !== 'object' || !('arxId' in attrs)) return null
  const id = (attrs as { arxId: unknown }).arxId
  return typeof id === 'string' && id !== '' ? id : null
}

function headingLevel(node: ArxNode): number {
  const attrs = node.attrs
  const level = attrs != null && typeof attrs === 'object' && 'level' in attrs ? (attrs as { level: unknown }).level : null
  const parsed = typeof level === 'number' ? Math.trunc(level) : Number.NaN
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, 1), 6) : 1
}

function childrenOf(node: ArxNode): ArxNode[] | null {
  if (!Array.isArray(node.content)) return null
  return node.content.filter((child): child is ArxNode => child != null && typeof child === 'object')
}

// Flattens a node's text. `keepBreaks` is for code, where a newline is part of the content; elsewhere a
// hard break reads as a space, the same way markdown's soft line break does.
function readText(node: ArxNode, keepBreaks: boolean): { text: string; links: Omit<ParsedRef, 'srcBlock'>[] } {
  const parts: string[] = []
  const links: Omit<ParsedRef, 'srcBlock'>[] = []

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
      // The enumerations directly inside this block are appendNode's, not text of this one. Deeper down
      // they are still flattened: nothing else would emit them, and losing the text is worse than losing
      // the shape.
      if (top && isContainer(child)) continue
      // A block boundary reads as whitespace, the way markdown's soft line break does (joinSoftLines).
      // Without it two paragraphs of a quote fuse into a token neither of their words matches.
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
    if (mark == null || typeof mark !== 'object') continue
    const { type, attrs } = mark as { type?: unknown; attrs?: unknown }
    if (type !== 'link' || attrs == null || typeof attrs !== 'object') continue
    const href = (attrs as { href?: unknown }).href
    if (typeof href === 'string' && href.trim() !== '') return href.trim()
  }
  return null
}
