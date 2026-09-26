import { redo, undo } from 'prosemirror-history'
import type { MarkType } from 'prosemirror-model'
import type { Command } from 'prosemirror-state'
import { schema } from '../editor-schema'
import { BLOCK_COMMANDS } from '../slash-commands'

// The toolbar as data, in a module of its own rather than inside the component — so the test beside it
// checks the very tables the toolbar renders instead of a hand-copied list of names. A button added here
// is covered by construction; a list retyped in a test is how `bold`/`italic` shipped pointing at marks
// the schema does not have (see below).
//
// One icon system, for the same reason the tables are data: the row used to run
// "B I S U ` H1 H2 H3 ¶ • 1. ❝ ↩ ↪" — letters, typographic marks, and two COLOUR EMOJI for undo/redo that
// carry their own blue tiles and follow no theme. The markdown editor drew the same actions as lucide
// icons already, so one product drew one job two ways.

export interface MarkAction {
  label: string
  icon: string
  mark: MarkType
}

export interface CommandAction {
  label: string
  icon: string
  run: () => Command
}

// `strong` and `em`, not `bold` and `italic` — those are the names prosemirror-schema-basic gives them,
// and the two the toolbar used to ask for did not exist. `isMarkActive` then read `isInSet` off undefined
// and threw during render, so opening a note in this editor took its toolbar (and sometimes the app) down,
// and neither button had ever worked.
export const MARKS: MarkAction[] = [
  { label: 'Bold', icon: 'lu:bold', mark: schema.marks.strong },
  { label: 'Italic', icon: 'lu:italic', mark: schema.marks.em },
  { label: 'Strikethrough', icon: 'lu:strikethrough', mark: schema.marks.strike },
  { label: 'Underline', icon: 'lu:underline', mark: schema.marks.underline },
  { label: 'Highlight', icon: 'lu:highlighter', mark: schema.marks.highlight },
  { label: 'Inline code', icon: 'lu:code', mark: schema.marks.code },
]

const textBlocks = new Set(['paragraph', 'heading-1', 'heading-2', 'heading-3'])
const toolbarCommand = (command: (typeof BLOCK_COMMANDS)[number]): CommandAction => ({
  label: command.label,
  icon: command.icon,
  run: () => command.run,
})

export const BLOCKS: CommandAction[] = BLOCK_COMMANDS.filter((command) => textBlocks.has(command.id)).map(toolbarCommand)
export const LISTS: CommandAction[] = BLOCK_COMMANDS.filter((command) => !textBlocks.has(command.id)).map(toolbarCommand)

export const HISTORY: { label: string; icon: string; run: Command }[] = [
  { label: 'Undo', icon: 'lu:undo', run: undo },
  { label: 'Redo', icon: 'lu:redo', run: redo },
]

// The block commands the phone's editing band offers: what a line of text turns into while writing. The
// rest of the slash menu inserts things (a table, columns, an image) and stays in the slash menu.
const editingBlocks = new Set(['heading-1', 'heading-2', 'heading-3', 'paragraph', 'bullet-list', 'ordered-list', 'task-list', 'quote', 'code'])
export const EDITING_BLOCKS: CommandAction[] = BLOCK_COMMANDS.filter((command) => editingBlocks.has(command.id)).map(toolbarCommand)

// What earns a key of its own on that band; the rest wait behind its More key.
export const PRIMARY_EDITING: ReadonlySet<string> = new Set(['Bold', 'Italic', 'Heading 1', 'Bulleted list', 'Task list'])
