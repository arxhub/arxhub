import { closeHistory } from 'prosemirror-history'
import { type Command, Selection, TextSelection } from 'prosemirror-state'
import { BlockSelection, selectedBlocks } from './block-selection'
import { runPreparedCommand } from './command-state'
import { editorMode } from './editor-mode'
import type { BlockCommand } from './slash-commands'

export type BlockAction = 'up' | 'down' | 'duplicate' | 'delete'

// Top-level blocks are the document's movable units; a list travels with all its items.
export const changeBlock =
  (action: BlockAction): Command =>
  (state, dispatch) => {
    if (editorMode(state) !== 'editable') return false
    const range = selectedBlocks(state)
    if (!range) return false
    const { from, to: end, index, endIndex, content } = range
    if ((action === 'up' && index === 0) || (action === 'down' && endIndex === state.doc.childCount)) return false
    if (!dispatch) return true
    const tr = state.tr
    let target = from
    if (action === 'delete') {
      if (range.count === state.doc.childCount) tr.replaceWith(from, end, state.schema.nodes.paragraph.create())
      else tr.delete(from, end)
    } else if (action === 'duplicate') {
      tr.insert(end, content)
      target = end
    } else if (action === 'up') {
      const previous = state.doc.child(index - 1)
      target = from - previous.nodeSize
      tr.replaceWith(target, end, content.addToEnd(previous))
    } else {
      const next = state.doc.child(endIndex)
      tr.replaceWith(from, end + next.nodeSize, content.addToStart(next))
      target = from + next.nodeSize
    }
    const offset = action === 'delete' ? 0 : state.selection.from - from
    tr.setSelection(
      action !== 'delete' && !state.selection.empty
        ? BlockSelection.create(tr.doc, target, target + content.size)
        : Selection.near(tr.doc.resolve(Math.min(target + offset, tr.doc.content.size))),
    )
    dispatch(closeHistory(tr).scrollIntoView())
    return true
  }

export const moveBlocksTo =
  (position: number): Command =>
  (state, dispatch) => {
    if (editorMode(state) !== 'editable') return false
    const range = selectedBlocks(state)
    if (!range || position < 0 || position > state.doc.content.size || state.doc.resolve(position).depth !== 0) return false
    if (position >= range.from && position <= range.to) return false
    if (dispatch) {
      const target = position > range.to ? position - range.content.size : position
      const tr = state.tr.delete(range.from, range.to).insert(target, range.content)
      tr.setSelection(BlockSelection.create(tr.doc, target, target + range.content.size))
      dispatch(closeHistory(tr).scrollIntoView())
    }
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
