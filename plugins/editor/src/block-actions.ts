import { closeHistory } from 'prosemirror-history'
import { type Command, Selection, TextSelection } from 'prosemirror-state'
import { runPreparedCommand } from './command-state'
import { editorMode } from './editor-mode'
import type { BlockCommand } from './slash-commands'

export type BlockAction = 'up' | 'down' | 'duplicate' | 'delete'

// Top-level blocks are the document's movable units; a list travels with all its items.
export const changeBlock =
  (action: BlockAction): Command =>
  (state, dispatch) => {
    if (editorMode(state) !== 'editable') return false
    const { $from, to } = state.selection
    const index = $from.index(0)
    const block = state.doc.maybeChild(index)
    if (!block) return false
    const from = $from.depth ? $from.before(1) : $from.pos
    const end = from + block.nodeSize
    if (to > end || (action === 'up' && index === 0) || (action === 'down' && index === state.doc.childCount - 1)) return false
    if (!dispatch) return true
    const tr = state.tr
    let target = from
    if (action === 'delete') {
      if (state.doc.childCount === 1) tr.replaceWith(from, end, state.schema.nodes.paragraph.create())
      else tr.delete(from, end)
    } else if (action === 'duplicate') {
      tr.insert(end, block)
      target = end
    } else if (action === 'up') {
      const previous = state.doc.child(index - 1)
      target = from - previous.nodeSize
      tr.replaceWith(target, end, [block, previous])
    } else {
      const next = state.doc.child(index + 1)
      tr.replaceWith(from, end + next.nodeSize, [next, block])
      target = from + next.nodeSize
    }
    const offset = action === 'delete' ? 0 : state.selection.from - from
    tr.setSelection(Selection.near(tr.doc.resolve(Math.min(target + offset, tr.doc.content.size))))
    dispatch(closeHistory(tr).scrollIntoView())
    return true
  }

export const insertBlock =
  (command: BlockCommand): Command =>
  (state, dispatch) => {
    if (editorMode(state) !== 'editable') return false
    const { $from } = state.selection
    const tr = state.tr
    const empty = state.selection.empty && $from.parent.type === state.schema.nodes.paragraph && $from.parent.content.size === 0
    if (!empty) {
      const pos = $from.depth ? $from.after(1) : $from.pos
      tr.insert(pos, state.schema.nodes.paragraph.create())
      tr.setSelection(TextSelection.create(tr.doc, pos + 1))
    }
    if (!runPreparedCommand(state, tr, command.run)) return false
    if (dispatch) dispatch(closeHistory(tr).scrollIntoView())
    return true
  }
