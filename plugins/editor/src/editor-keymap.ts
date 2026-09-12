import { baseKeymap, chainCommands, setBlockType, toggleMark } from 'prosemirror-commands'
import { redo, undo } from 'prosemirror-history'
import type { Schema } from 'prosemirror-model'
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list'
import type { Command } from 'prosemirror-state'
import { goToNextCell } from 'prosemirror-tables'
import { editorMode } from './editor-mode'

export function buildKeymap(schema: Schema): Record<string, Command> {
  const keys: Record<string, Command> = { ...baseKeymap }

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
