import { closeHistory } from 'prosemirror-history'
import { Fragment } from 'prosemirror-model'
import { type Command, Selection, TextSelection } from 'prosemirror-state'
import { BlockSelection, selectedBlocks } from './block-selection'
import { runPreparedCommand } from './command-state'
import { editorMode } from './editor-mode'
import type { BlockCommand } from './slash-commands'

export type BlockAction = 'up' | 'down' | 'duplicate' | 'delete'

export const insertParagraphBeside =
  (side: 'before' | 'after'): Command =>
  (state, dispatch) => {
    if (editorMode(state) !== 'editable') return false
    const range = selectedBlocks(state)
    if (!range) return false
    const position = side === 'before' ? range.from : range.to
    const $pos = state.doc.resolve(position)
    const paragraph = state.schema.nodes.paragraph
    if (!paragraph || !$pos.parent.canReplaceWith($pos.index(), $pos.index(), paragraph)) return false
    if (dispatch) {
      const tr = state.tr.insert(position, paragraph.create())
      dispatch(closeHistory(tr.setSelection(TextSelection.create(tr.doc, position + 1))).scrollIntoView())
    }
    return true
  }

// A range owns its parent: nested actions may never rewrite the enclosing document by accident.
export const changeBlock =
  (action: BlockAction): Command =>
  (state, dispatch) => {
    if (editorMode(state) !== 'editable') return false
    const range = selectedBlocks(state)
    if (!range) return false
    if (range.spans.length > 1) return changeBlockSet(action)(state, dispatch)
    const { from, to: end, index, endIndex, content, parent } = range
    if ((action === 'up' && index === 0) || (action === 'down' && endIndex === parent.childCount)) return false
    const tr = state.tr
    let target = from
    if (action === 'delete') {
      const replacement = parent.canReplace(index, endIndex) ? Fragment.empty : Fragment.from(state.schema.nodes.paragraph.create())
      if (!parent.canReplace(index, endIndex, replacement)) return false
      tr.replaceWith(from, end, replacement)
    } else if (action === 'duplicate') {
      if (!parent.canReplace(endIndex, endIndex, content)) return false
      tr.insert(end, content)
      target = end
    } else if (action === 'up') {
      const previous = parent.child(index - 1)
      target = from - previous.nodeSize
      if (!parent.canReplace(index - 1, endIndex, content.addToEnd(previous))) return false
      tr.replaceWith(target, end, content.addToEnd(previous))
    } else {
      const next = parent.child(endIndex)
      if (!parent.canReplace(index, endIndex + 1, content.addToStart(next))) return false
      tr.replaceWith(from, end + next.nodeSize, content.addToStart(next))
      target = from + next.nodeSize
    }
    const offset = action === 'delete' ? 0 : state.selection.from - from
    tr.setSelection(
      action !== 'delete' && !state.selection.empty
        ? BlockSelection.create(tr.doc, target, target + content.size)
        : Selection.near(tr.doc.resolve(Math.min(target + offset, tr.doc.content.size))),
    )
    dispatch?.(closeHistory(tr).scrollIntoView())
    return true
  }

export const moveBlocksTo =
  (position: number): Command =>
  (state, dispatch) => {
    if (editorMode(state) !== 'editable') return false
    const range = selectedBlocks(state)
    if (!range || position < 0 || position > state.doc.content.size || !state.doc.resolve(position).sameParent(state.doc.resolve(range.from)))
      return false
    const remaining: (typeof state.doc)[] = []
    let destination = 0
    range.parent.forEach((node, offset) => {
      const pos = range.start + offset
      if (range.spans.some((span) => pos >= span.from && pos < span.to)) return
      if (pos < position) destination++
      remaining.push(node)
    })
    remaining.splice(destination, 0, ...range.content.content)
    if (!range.parent.type.validContent(Fragment.from(remaining))) return false
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
      const range = selectedBlocks(state)
      if (!range) return false
      const pos = range.to
      const $pos = state.doc.resolve(pos)
      if (!$pos.parent.canReplaceWith($pos.index(), $pos.index(), state.schema.nodes.paragraph)) return false
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
    range.parent.forEach((node, offset) => {
      const pos = range.start + offset
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
    const content = Fragment.from(items.map((item) => item.node))
    if (!range.parent.canReplace(0, range.parent.childCount, content)) return false
    if (dispatch) {
      const tr = state.tr.replaceWith(range.start, range.start + range.parent.content.size, content)
      const spans: { from: number; to: number }[] = []
      let pos = range.start
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
