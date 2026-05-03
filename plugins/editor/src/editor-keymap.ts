import type { Schema } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import { toggleMark, baseKeymap, setBlockType, chainCommands } from 'prosemirror-commands'
import { undo, redo } from 'prosemirror-history'
import { splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list'

export function buildKeymap(schema: Schema): Record<string, Command> {
  const keys: Record<string, Command> = { ...baseKeymap }

  if (schema.marks.bold) keys['Mod-b'] = toggleMark(schema.marks.bold)
  if (schema.marks.italic) keys['Mod-i'] = toggleMark(schema.marks.italic)
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
    keys['Enter'] = chainCommands(splitListItem(schema.nodes.list_item), baseKeymap['Enter'])
    keys['Tab'] = sinkListItem(schema.nodes.list_item)
    keys['Shift-Tab'] = liftListItem(schema.nodes.list_item)
  }

  return keys
}
