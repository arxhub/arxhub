import type { FormattingAction } from '@arxhub/uikit/core'
import { redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import {
  insertLink,
  isBoldActive,
  isBulletActive,
  isHeadingActive,
  isInlineCodeActive,
  isItalicActive,
  isQuoteActive,
  isStrikethroughActive,
  isTaskActive,
  toggleBold,
  toggleBullet,
  toggleHeading,
  toggleInlineCode,
  toggleItalic,
  toggleQuote,
  toggleStrikethrough,
  toggleTask,
} from './markdown-commands'

interface MarkdownAction {
  label: string
  icon: string
  run: (view: EditorView) => boolean
  // Asks the same question the toggle command would answer for itself — is the selection already wrapped
  // in the marker, is the line already prefixed — rather than a markdown parse. Link has none: inserting
  // one is never a toggle.
  active?: (view: EditorView) => boolean
  // What earns a key of its own on the phone's editing band; the rest wait behind its More key. The
  // desktop strip has the room to draw every one.
  primary?: boolean
}

// One icon system, declared as data so the row cannot drift into a mix of letters and glyphs again. It
// previously ran "H1 H2 H3 · B I S </> · • ☑ ❝ 🔗" — three notations at once, the last of them a colour
// emoji that no theme can restyle and that reads as a foreign object on a dark base.
export const MARKDOWN_ACTIONS: readonly MarkdownAction[] = [
  { label: 'Heading 1', icon: 'lu:heading-1', run: (v) => toggleHeading(v, 1), active: (v) => isHeadingActive(v, 1), primary: true },
  { label: 'Heading 2', icon: 'lu:heading-2', run: (v) => toggleHeading(v, 2), active: (v) => isHeadingActive(v, 2) },
  { label: 'Heading 3', icon: 'lu:heading-3', run: (v) => toggleHeading(v, 3), active: (v) => isHeadingActive(v, 3) },
  { label: 'Bold', icon: 'lu:bold', run: toggleBold, active: isBoldActive, primary: true },
  { label: 'Italic', icon: 'lu:italic', run: toggleItalic, active: isItalicActive, primary: true },
  { label: 'Strikethrough', icon: 'lu:strikethrough', run: toggleStrikethrough, active: isStrikethroughActive },
  { label: 'Inline code', icon: 'lu:code', run: toggleInlineCode, active: isInlineCodeActive },
  { label: 'Bulleted list', icon: 'lu:list', run: toggleBullet, active: isBulletActive, primary: true },
  { label: 'Task list', icon: 'lu:list-todo', run: toggleTask, active: isTaskActive, primary: true },
  { label: 'Quote', icon: 'lu:quote', run: toggleQuote, active: isQuoteActive },
  { label: 'Link', icon: 'lu:link', run: insertLink, primary: true },
]

function focused(view: EditorView | null, command: (view: EditorView) => boolean): void {
  if (view == null) return
  command(view)
  view.focus()
}

export function markdownActions(view: EditorView | null): FormattingAction[] {
  return MARKDOWN_ACTIONS.map((action) => ({
    id: action.label,
    label: action.label,
    icon: action.icon,
    primary: action.primary === true,
    active: view != null && action.active != null ? action.active(view) : false,
    run: () => focused(view, action.run),
  }))
}

// Undo and redo for the phone's editing band, where there are no chords to reach them by. Disabled while
// there is nothing to undo, so a key that does nothing never looks like one that failed.
export function historyActions(view: EditorView | null): FormattingAction[] {
  return [
    { id: 'undo', label: 'Undo', icon: 'lu:undo', disabled: view == null || undoDepth(view.state) === 0, run: () => focused(view, undo) },
    { id: 'redo', label: 'Redo', icon: 'lu:redo', disabled: view == null || redoDepth(view.state) === 0, run: () => focused(view, redo) },
  ]
}
