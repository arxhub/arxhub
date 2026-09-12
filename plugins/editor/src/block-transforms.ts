import { closeHistory } from 'prosemirror-history'
import { Fragment, type Node, type Schema } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import { BlockSelection, selectedBlocks } from './block-selection'
import { editorMode } from './editor-mode'

export const BLOCK_TRANSFORMS = [
  { id: 'paragraph', label: 'Paragraph', icon: 'lu:pilcrow' },
  { id: 'heading-1', label: 'Heading 1', icon: 'lu:heading-1' },
  { id: 'heading-2', label: 'Heading 2', icon: 'lu:heading-2' },
  { id: 'heading-3', label: 'Heading 3', icon: 'lu:heading-3' },
  { id: 'bullet_list', label: 'Bulleted list', icon: 'lu:list' },
  { id: 'ordered_list', label: 'Numbered list', icon: 'lu:list-ordered' },
  { id: 'task_list', label: 'Task list', icon: 'lu:list-checks' },
  { id: 'blockquote', label: 'Quote', icon: 'lu:quote' },
  { id: 'callout', label: 'Callout', icon: 'lu:info' },
  { id: 'code_block', label: 'Code block', icon: 'lu:code' },
] as const

type Target = (typeof BLOCK_TRANSFORMS)[number]['id']
const lists = new Set(['bullet_list', 'ordered_list', 'task_list'])
const wrappers = new Set(['blockquote', 'callout'])
const text = new Set(['paragraph', 'heading', 'code_block'])

function paragraph(node: Node, schema: Schema): Node | null {
  if (!text.has(node.type.name)) return null
  if (node.type.name !== 'code_block') return schema.nodes.paragraph.create(null, node.content)
  const content: Node[] = []
  node.textContent.split('\n').forEach((line, index) => {
    if (index) content.push(schema.nodes.hard_break.create())
    if (line) content.push(schema.text(line))
  })
  return schema.nodes.paragraph.create(null, content)
}

function flatten(node: Node): Node[] | null {
  if (text.has(node.type.name)) return [node]
  if (!lists.has(node.type.name) && !wrappers.has(node.type.name) && !['list_item', 'task_item'].includes(node.type.name)) return null
  const nodes: Node[] = []
  for (const child of node.children) {
    const flattened = flatten(child)
    if (!flattened) return null
    nodes.push(...flattened)
  }
  return nodes
}

export const transformBlocks =
  (target: Target): Command =>
  (state, dispatch) => {
    if (editorMode(state) !== 'editable') return false
    const range = selectedBlocks(state)
    if (!range) return false
    const { schema } = state
    let nodes: Node[] = []
    if (wrappers.has(target)) {
      const first = range.content.firstChild
      const children = range.content.childCount === 1 && first && wrappers.has(first.type.name) ? first.content : range.content
      nodes = [schema.nodes[target].create(null, children)]
    } else if (lists.has(target)) {
      const items: Node[] = []
      const itemType = schema.nodes[target === 'task_list' ? 'task_item' : 'list_item']
      for (const block of range.content.content) {
        if (lists.has(block.type.name)) {
          for (const item of block.children) {
            items.push(itemType.create(target === 'task_list' ? { checked: item.attrs.checked ?? false } : null, item.content))
          }
        } else {
          const converted = paragraph(block, schema)
          if (!converted) return false
          items.push(itemType.create(null, converted))
        }
      }
      nodes = [schema.nodes[target].create(null, items)]
    } else {
      for (const block of range.content.content) {
        const flattened = flatten(block)
        if (!flattened) return false
        for (const node of flattened) {
          if (target === 'code_block') {
            if (node.children.some((child) => !child.isText && child.type.name !== 'hard_break')) return false
            const value = node.textBetween(0, node.content.size, '\n', '\n')
            nodes.push(schema.nodes.code_block.create(null, value ? schema.text(value) : null))
          } else {
            const converted = paragraph(node, schema)
            if (!converted) return false
            nodes.push(target === 'paragraph' ? converted : schema.nodes.heading.create({ level: Number(target.at(-1)) }, converted.content))
          }
        }
      }
    }
    const content = Fragment.from(nodes)
    if (content.eq(range.content)) return false
    if (dispatch) {
      const tr = state.tr.replaceWith(range.from, range.to, content)
      tr.setSelection(BlockSelection.create(tr.doc, range.from, range.from + content.size))
      dispatch(closeHistory(tr).scrollIntoView())
    }
    return true
  }
