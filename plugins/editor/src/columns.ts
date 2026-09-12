import { closeHistory } from 'prosemirror-history'
import { Fragment, type NodeSpec } from 'prosemirror-model'
import { type Command, Selection } from 'prosemirror-state'
import { selectedBlocks } from './block-selection'
import { editorMode } from './editor-mode'

export const columnNodes: Record<string, NodeSpec> = {
  columns: {
    group: 'block',
    content: 'column{2,3}',
    defining: true,
    isolating: true,
    parseDOM: [{ tag: 'div[data-arx-columns]' }],
    toDOM: () => ['div', { 'data-arx-columns': '' }, 0],
  },
  column: {
    content: 'block+',
    isolating: true,
    parseDOM: [{ tag: 'div[data-arx-column]' }],
    toDOM: () => ['div', { 'data-arx-column': '', class: 'arx-column' }, 0],
  },
}

export const arrangeColumns =
  (count: 1 | 2 | 3): Command =>
  (state, dispatch) => {
    if (editorMode(state) !== 'editable') return false
    const range = selectedBlocks(state)
    if (!range) return false
    const blocks = range.content.content.flatMap((node) =>
      node.type.name === 'columns' ? node.children.flatMap((column) => column.children) : [node],
    )
    if (count === 1 && !range.content.content.some((node) => node.type.name === 'columns')) return false
    const content =
      count === 1
        ? Fragment.from(blocks)
        : Fragment.from(
            state.schema.nodes.columns.create(
              null,
              Array.from({ length: count }, (_, index) => {
                const start = Math.ceil((blocks.length * index) / count)
                const end = Math.ceil((blocks.length * (index + 1)) / count)
                return state.schema.nodes.column.create(null, end > start ? blocks.slice(start, end) : state.schema.nodes.paragraph.create())
              }),
            ),
          )
    if (dispatch) {
      const tr = state.tr
      for (const span of range.spans.slice(1).reverse()) tr.delete(span.from, span.to)
      tr.replaceWith(range.spans[0].from, range.spans[0].to, content)
      tr.setSelection(Selection.near(tr.doc.resolve(range.from + (count > 1 ? 2 : 0))))
      dispatch(closeHistory(tr).scrollIntoView())
    }
    return true
  }
