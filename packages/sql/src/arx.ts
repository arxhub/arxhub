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
// callout, a quote) is opened rather than flattened into one row: `list-item` is a block type and
// `list` is not, so a two-item list is two blocks — the same result markdown gives.
const BLOCK_TYPES: Record<string, BlockType> = {
  heading: 'heading',
  paragraph: 'paragraph',
  code_block: 'code',
  blockquote: 'quote',
  list_item: 'list-item',
  task_item: 'list-item',
}

const CONTAINERS = new Set(['bullet_list', 'ordered_list', 'task_list', 'callout'])

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
    appendNode(child, result)
  }
  return result
}

function appendNode(node: ArxNode, result: ArxParse): void {
  const type = typeof node.type === 'string' ? node.type : ''
  if (IGNORED.has(type)) return

  if (CONTAINERS.has(type)) {
    for (const child of childrenOf(node) ?? []) {
      appendNode(child, result)
    }
    return
  }

  const blockType = BLOCK_TYPES[type] ?? 'paragraph'
  const blockIndex = result.blocks.length
  const { text, links } = readText(node, blockType === 'code')
  if (text.trim() === '' && links.length === 0) return

  result.blocks.push({
    type: blockType,
    level: blockType === 'heading' ? headingLevel(node) : null,
    raw: text,
    content: text,
  })
  for (const link of links) {
    result.markLinks.push({ blockIndex, ref: link })
  }
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

  const visit = (current: ArxNode): void => {
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
      visit(child)
    }
  }

  visit(node)
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
