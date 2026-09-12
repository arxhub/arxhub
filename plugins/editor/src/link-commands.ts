import { closeHistory } from 'prosemirror-history'
import type { Command, EditorState } from 'prosemirror-state'
import { editorMode } from './editor-mode'

export function safeLink(value: string): string | null {
  const href = value.trim()
  if (!href) return null
  try {
    const url = new URL(href, 'https://arxhub.invalid/')
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) ? href : null
  } catch {
    return null
  }
}

export function linkAtSelection(state: EditorState): { from: number; to: number; href: string } | null {
  const { $from, empty } = state.selection
  const type = state.schema.marks.link
  if (!type) return null
  const child = $from.parent.childAfter($from.parentOffset)
  const at = child.node ? child : $from.parent.childBefore($from.parentOffset)
  const mark = type.isInSet(at.node?.marks ?? [])
  if (!mark || !at.node) return null
  if (!empty) return { from: state.selection.from, to: state.selection.to, href: String(mark.attrs.href) }
  let from = $from.start() + at.offset
  let to = from + at.node.nodeSize
  for (let index = at.index - 1; index >= 0; index--) {
    const node = $from.parent.child(index)
    if (!mark.isInSet(node.marks)) break
    from -= node.nodeSize
  }
  for (let index = at.index + 1; index < $from.parent.childCount; index++) {
    const node = $from.parent.child(index)
    if (!mark.isInSet(node.marks)) break
    to += node.nodeSize
  }
  return { from, to, href: String(mark.attrs.href) }
}

export const setLink =
  (value: string | null): Command =>
  (state, dispatch) => {
    if (editorMode(state) !== 'editable') return false
    const type = state.schema.marks.link
    const href = value === null ? null : safeLink(value)
    if (!type || (value !== null && href === null)) return false
    const existing = linkAtSelection(state)
    const { from, to } = existing ?? state.selection
    if (from === to && href === null) return false
    if (!state.selection.$from.parent.inlineContent || !state.selection.$from.parent.type.allowsMarkType(type)) return false
    if (dispatch) {
      const tr = state.tr
      if (from === to && href !== null) tr.insertText(href, from).addMark(from, from + href.length, type.create({ href }))
      else {
        tr.removeMark(from, to, type)
        if (href !== null) tr.addMark(from, to, type.create({ href }))
      }
      dispatch(closeHistory(tr).removeStoredMark(type).scrollIntoView())
    }
    return true
  }
