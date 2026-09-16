import { baseKeymap, chainCommands, setBlockType, toggleMark } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import { keydownHandler } from 'prosemirror-keymap'
import type { NodeType, Schema } from 'prosemirror-model'
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list'
import { type Command, TextSelection } from 'prosemirror-state'
import { goToNextCell } from 'prosemirror-tables'
import type { EditorView } from 'prosemirror-view'
import { editorMode } from './editor-mode'

// `baseKeymap` binds neither Home nor End on either platform (`prosemirror-commands` leaves line
// navigation to the browser's native contenteditable handling) — which real desktop browsers do supply
// from a physical keystroke, but which never arrives at all through a CDP-synthesized key event (no
// e2e suite can drive it), and which cannot know about a soft-wrapped visual line to begin with,
// unlike `Selection.modify('lineboundary')`, which does. Declaring it ourselves — the same choice
// `editor-keymap` already made for Tab/Shift-Tab/Enter in a list — makes it a fact of the schema rather
// than a hope about the platform.
function lineBoundary(dir: 1 | -1, extend: boolean): Command {
  return (state, dispatch, view) => {
    if (!view) return false
    const selection = view.dom.ownerDocument.getSelection()
    if (!selection?.focusNode || !view.dom.contains(selection.focusNode)) return false
    selection.modify(extend ? 'extend' : 'move', dir < 0 ? 'backward' : 'forward', 'lineboundary')
    if (!selection.anchorNode || !selection.focusNode || !view.dom.contains(selection.focusNode)) return false
    try {
      const anchor = view.posAtDOM(selection.anchorNode, selection.anchorOffset)
      const head = view.posAtDOM(selection.focusNode, selection.focusOffset)
      if (dispatch) dispatch(state.tr.setSelection(TextSelection.create(state.doc, anchor, head)))
      return true
    } catch {
      return false
    }
  }
}

// prosemirror-schema-list applies the new item's attrs only when the caret is at the END of the item; a
// split in the middle of the text copies the original attrs to both halves, so a finished task split in
// two became two finished tasks. The half after the caret is the one being created, and it always starts
// undone — the same answer an end-of-text split already gave.
function splitTaskItem(itemType: NodeType): Command {
  const split = splitListItem(itemType, { checked: false })
  return (state, dispatch) =>
    split(
      state,
      dispatch &&
        ((tr) => {
          const { $from } = tr.selection
          const item = $from.depth >= 2 ? $from.node(-1) : null
          if (item?.type === itemType && item.attrs.checked) tr.setNodeMarkup($from.before(-1), undefined, { ...item.attrs, checked: false })
          dispatch(tr)
        }),
    )
}

export function buildKeymap(schema: Schema): Record<string, Command> {
  const keys: Record<string, Command> = { ...baseKeymap }
  keys.Home = lineBoundary(-1, false)
  keys['Shift-Home'] = lineBoundary(-1, true)
  keys.End = lineBoundary(1, false)
  keys['Shift-End'] = lineBoundary(1, true)

  if (schema.marks.strong) keys['Mod-b'] = toggleMark(schema.marks.strong)
  if (schema.marks.em) keys['Mod-i'] = toggleMark(schema.marks.em)
  if (schema.marks.code) keys['Mod-`'] = toggleMark(schema.marks.code)
  if (schema.nodes.heading) {
    keys['Mod-Alt-1'] = setBlockType(schema.nodes.heading, { level: 1 })
    keys['Mod-Alt-2'] = setBlockType(schema.nodes.heading, { level: 2 })
    keys['Mod-Alt-3'] = setBlockType(schema.nodes.heading, { level: 3 })
  }

  const historyChords = new Set(['Mod-z', 'Mod-Shift-z', 'Mod-y'])
  keys['Mod-z'] = undo
  keys['Mod-Shift-z'] = redo
  keys['Mod-y'] = redo

  if (schema.nodes.list_item) {
    keys.Enter = chainCommands(splitListItem(schema.nodes.list_item), baseKeymap.Enter)
    keys.Tab = sinkListItem(schema.nodes.list_item)
    keys['Shift-Tab'] = liftListItem(schema.nodes.list_item)
  }

  if (schema.nodes.task_item) {
    keys.Tab = chainCommands(sinkListItem(schema.nodes.task_item), keys.Tab)
    keys['Shift-Tab'] = chainCommands(liftListItem(schema.nodes.task_item), keys['Shift-Tab'])
    keys.Enter = chainCommands(splitTaskItem(schema.nodes.task_item), liftListItem(schema.nodes.task_item), keys.Enter)
  }

  if (schema.nodes.table) {
    keys.Tab = chainCommands(goToNextCell(1), keys.Tab)
    keys['Shift-Tab'] = chainCommands(goToNextCell(-1), keys['Shift-Tab'])
  }

  // History is the one thing interactive mode may still do: a ticked box or a picked value is a change
  // of its own, and undoing it is the same kind of change. The mode's transaction filter decides what
  // an undo may restore (`onlyControlValuesChanged`) — a step that would bring text back is refused
  // there, not here — so the keymap only has to keep the chords out of readonly.
  return Object.fromEntries(
    Object.entries(keys).map(([chord, command]) => [
      chord,
      ((state, dispatch, view) => {
        const mode = editorMode(state)
        const allowed = mode === 'editable' || (mode === 'interactive' && historyChords.has(chord))
        return allowed && command(state, dispatch, view)
      }) satisfies Command,
    ]),
  )
}

// Letting the history chords through `buildKeymap` is not enough on its own to make them work:
// ProseMirror lists `keydown` among its EDIT handlers, so a view that is not editable never reaches
// `handleKeyDown` at all, keymap included — and interactive mode is deliberately not editable. The
// chords it may still use therefore need a door of their own, and it is the editor's own root that
// listens rather than the view's DOM: a node view stops every event raised inside a control's component
// from reaching the view (`control-views.ts`), and right after ticking the box you want back is exactly
// where the focus is. WHICH chords get through is still decided in one place — the bindings handed in
// here are the same gated ones the keymap plugin is given.
export function interactiveKeydown(keys: Record<string, Command>): (view: EditorView, event: KeyboardEvent) => boolean {
  const handler = keydownHandler(keys)
  return (view, event) => editorMode(view.state) === 'interactive' && handler(view, event)
}
