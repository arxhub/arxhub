import type { EditorView } from 'prosemirror-view'

export function focusDocument(view: EditorView): void {
  view.dom.focus({ preventScroll: true })
  // ProseMirror only syncs a readonly selection when the browser already has one inside it.
  if (!view.editable) {
    const { from, to } = view.state.selection
    const start = view.domAtPos(from)
    const end = view.domAtPos(to)
    const range = view.dom.ownerDocument.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    const selection = view.dom.ownerDocument.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
  view.focus()
}
