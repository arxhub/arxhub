import { closeHistory } from 'prosemirror-history'
import { Fragment } from 'prosemirror-model'
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
    if (range.spans.length > 1) return changeBlockSet(action)(state, dispatch)
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
    if (range.spans.length > 1) {
      if (range.spans.some((span) => position > span.from && position < span.to)) return false
      if (dispatch) {
        const tr = state.tr
        for (const span of [...range.spans].reverse()) tr.delete(span.from, span.to)
        const target = tr.mapping.map(position)
        tr.insert(target, range.content).setSelection(BlockSelection.create(tr.doc, target, target + range.content.size))
        dispatch(closeHistory(tr).scrollIntoView())
      }
      return true
    }
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

const changeBlockSet =
  (action: BlockAction): Command =>
  (state, dispatch) => {
    const range = selectedBlocks(state)
    if (!range) return false
    let items: { node: typeof state.doc; selected: boolean }[] = []
    state.doc.forEach((node, pos) => {
      items.push({ node, selected: range.spans.some((span) => pos >= span.from && pos < span.to) })
    })
    if (action === 'delete') items = items.filter((item) => !item.selected)
    else if (action === 'duplicate') {
      const copies = items.filter((item) => item.selected)
      items = items.map((item) => ({ ...item, selected: false }))
      items.splice(range.endIndex, 0, ...copies)
    } else {
      let changed = false
      const delta = action === 'up' ? -1 : 1
      for (let i = delta < 0 ? 0 : items.length - 1; i >= 0 && i < items.length; i -= delta) {
        const next = i + delta
        if (items[i].selected && items[next] && !items[next].selected) {
          const previous = items[i]
          items[i] = items[next]
          items[next] = previous
          changed = true
        }
      }
      if (!changed) return false
    }
    if (dispatch) {
      const tr = state.tr.replaceWith(0, state.doc.content.size, Fragment.from(items.map((item) => item.node)))
      const spans: { from: number; to: number }[] = []
      let pos = 0
      for (const item of items) {
        if (item.selected) spans.push({ from: pos, to: pos + item.node.nodeSize })
        pos += item.node.nodeSize
      }
      tr.setSelection(
        spans.length ? BlockSelection.fromSpans(tr.doc, spans) : Selection.near(tr.doc.resolve(Math.min(range.from, tr.doc.content.size))),
      )
      dispatch(closeHistory(tr).scrollIntoView())
    }
    return true
  }
