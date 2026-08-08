import { EditorSelection } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

// Formatting commands operate on the markdown text itself, so what the user sees on disk is exactly
// what the toolbar produced — no serializer sits in between to reformat the rest of the file.

function wrapSelection(view: EditorView, marker: string): boolean {
  const changes = view.state.changeByRange((range) => {
    const text = view.state.sliceDoc(range.from, range.to)
    const before = view.state.sliceDoc(Math.max(0, range.from - marker.length), range.from)
    const after = view.state.sliceDoc(range.to, Math.min(view.state.doc.length, range.to + marker.length))

    // Toggle off when the selection already sits inside the markers.
    if (before === marker && after === marker) {
      return {
        changes: [
          { from: range.from - marker.length, to: range.from },
          { from: range.to, to: range.to + marker.length },
        ],
        range: EditorSelection.range(range.from - marker.length, range.to - marker.length),
      }
    }

    return {
      changes: { from: range.from, to: range.to, insert: `${marker}${text}${marker}` },
      range: EditorSelection.range(range.from + marker.length, range.to + marker.length),
    }
  })

  view.dispatch(changes, { scrollIntoView: true, userEvent: 'input.format' })
  return true
}

// Rewrites the prefix of every line the selection touches: headings, quotes, bullets and tasks are
// all line-level markers in markdown, so they share one implementation.
function setLinePrefix(view: EditorView, prefix: string, pattern: RegExp): boolean {
  const { state } = view
  const changes: { from: number; to: number; insert: string }[] = []

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let n = first; n <= last; n++) {
      const line = state.doc.line(n)
      const existing = line.text.match(pattern)?.[0] ?? ''
      // Applying the same prefix twice removes it, so a toolbar button toggles.
      const insert = existing === prefix ? '' : prefix
      changes.push({ from: line.from, to: line.from + existing.length, insert })
    }
  }

  view.dispatch({ changes, userEvent: 'input.format' })
  return true
}

const HEADING = /^#{1,6} /
const QUOTE = /^> /
const BULLET = /^[-*+] (?:\[[ xX]\] )?/
const TASK = /^[-*+] \[[ xX]\] /

export const toggleBold = (view: EditorView): boolean => wrapSelection(view, '**')
export const toggleItalic = (view: EditorView): boolean => wrapSelection(view, '*')
export const toggleInlineCode = (view: EditorView): boolean => wrapSelection(view, '`')
export const toggleStrikethrough = (view: EditorView): boolean => wrapSelection(view, '~~')
export const toggleHeading = (view: EditorView, level: number): boolean => setLinePrefix(view, `${'#'.repeat(level)} `, HEADING)
export const toggleQuote = (view: EditorView): boolean => setLinePrefix(view, '> ', QUOTE)
export const toggleBullet = (view: EditorView): boolean => setLinePrefix(view, '- ', BULLET)
export const toggleTask = (view: EditorView): boolean => setLinePrefix(view, '- [ ] ', TASK)

// Active-state detection for the toolbar. ProseMirror can answer "is bold active" by reading a mark off
// the document at the caret; markdown-as-text has no such structure, so this asks the narrower question
// the toggle commands above already answer for themselves — "would running this again undo it" — by
// re-running their own adjacency check rather than parsing the line into markdown.

// Mirrors wrapSelection's own toggle-off condition: the selection (or, if empty, the caret) sits
// immediately between two copies of `marker`. A real markdown parse would also catch a caret resting
// anywhere *inside* a longer marked run without the run itself selected; this narrower check only
// catches the exact shape the toggle command itself would unwrap.
export function isWrapped(view: EditorView, marker: string): boolean {
  const { from, to } = view.state.selection.main
  const before = view.state.sliceDoc(Math.max(0, from - marker.length), from)
  const after = view.state.sliceDoc(to, Math.min(view.state.doc.length, to + marker.length))
  return before === marker && after === marker
}

// Italic's marker (`*`) is also the tail of bold's (`**`), so a plain isWrapped(view, '*') would light
// up on a bold selection too. One more character on each side tells the two apart.
export function isItalicActive(view: EditorView): boolean {
  if (!isWrapped(view, '*')) return false
  const { from, to } = view.state.selection.main
  const outerBefore = view.state.sliceDoc(Math.max(0, from - 2), from - 1)
  const outerAfter = view.state.sliceDoc(to + 1, Math.min(view.state.doc.length, to + 2))
  return outerBefore !== '*' && outerAfter !== '*'
}

export const isBoldActive = (view: EditorView): boolean => isWrapped(view, '**')
export const isStrikethroughActive = (view: EditorView): boolean => isWrapped(view, '~~')
export const isInlineCodeActive = (view: EditorView): boolean => isWrapped(view, '`')

function currentLine(view: EditorView): string {
  return view.state.doc.lineAt(view.state.selection.main.head).text
}

export const isHeadingActive = (view: EditorView, level: number): boolean => currentLine(view).startsWith(`${'#'.repeat(level)} `)
export const isQuoteActive = (view: EditorView): boolean => QUOTE.test(currentLine(view))
// A task line also matches BULLET (it is a bullet with a checkbox), so the plain-bullet button only
// lights up when the checkbox is absent.
export const isBulletActive = (view: EditorView): boolean => BULLET.test(currentLine(view)) && !TASK.test(currentLine(view))
export const isTaskActive = (view: EditorView): boolean => TASK.test(currentLine(view))

export function insertLink(view: EditorView): boolean {
  const range = view.state.selection.main
  const text = view.state.sliceDoc(range.from, range.to)
  const insert = `[${text}]()`
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    // Park the caret inside the empty parentheses — the one thing the user still has to type.
    selection: { anchor: range.from + insert.length - 1 },
    userEvent: 'input.format',
  })
  return true
}
