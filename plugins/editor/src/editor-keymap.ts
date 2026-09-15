import { baseKeymap, chainCommands, setBlockType, toggleMark } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import type { Schema } from 'prosemirror-model'
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list'
import { type Command, TextSelection } from 'prosemirror-state'
import { goToNextCell } from 'prosemirror-tables'
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
    keys.Enter = chainCommands(splitListItem(schema.nodes.task_item, { checked: false }), liftListItem(schema.nodes.task_item), keys.Enter)
  }

  if (schema.nodes.table) {
    keys.Tab = chainCommands(goToNextCell(1), keys.Tab)
    keys['Shift-Tab'] = chainCommands(goToNextCell(-1), keys['Shift-Tab'])
  }

  return Object.fromEntries(
    Object.entries(keys).map(([chord, command]) => [
      chord,
      ((state, dispatch, view) => editorMode(state) === 'editable' && command(state, dispatch, view)) satisfies Command,
    ]),
  )
}
