import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

// CodeMirror's `basicSetup` brings its own light theme: fixed hex values for the gutter, the caret,
// the active line and the selection. Nothing in it consults our tokens, so a dark ArxHub theme used to
// paint a dark document with a white gutter down its left edge and a black caret you could not find.
//
// Every value here comes from a token, which is also why the theme is not declared `{ dark: true }` or
// `{ dark: false }`: a theme is swapped at runtime by flipping an attribute, so the editor cannot be
// told its base at construction. Driving the colours from tokens means both bases are correct without
// the editor knowing which one it is in.
//
// Shared by both hosts — the file-backed editor and the embeddable control — because a gutter that is
// legible in one and not the other is exactly the drift this replaces.
export interface EditorThemeOptions {
  // Whether to band the line the caret is on. True for code, where it is how you keep your place in a
  // stack trace; false for prose, where it draws a stripe across the sentence you are reading.
  //
  // A parameter rather than an override in the note profile: two themes both setting
  // `.cm-activeLine`'s background is a precedence puzzle (this one wins, and which one that is depends
  // on the order CodeMirror mounts its style modules), so the decision is made once, here, by the
  // caller who actually knows what kind of file it is.
  activeLine?: boolean
}

export function editorTheme({ activeLine = true }: EditorThemeOptions = {}): Extension {
  return EditorView.theme({
    '&': {
      color: 'var(--gray-12)',
      backgroundColor: 'transparent',
    },
    '.cm-content': {
      caretColor: 'var(--accent-11)',
    },
    // Two selectors for one caret: CodeMirror draws its own when it owns the selection, and the browser
    // draws the native one otherwise.
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--accent-11)',
    },
    // The selection is a highlight rather than a state, so it takes a wash and not the solid accent —
    // text has to stay readable through it.
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'var(--accent-4)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--gray-2)',
      color: 'var(--gray-9)',
      borderRight: '1px solid var(--gray-6)',
    },
    '.cm-activeLine': {
      backgroundColor: activeLine ? 'var(--gray-3)' : 'transparent',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--gray-4)',
      color: 'var(--gray-11)',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'var(--gray-4)',
      border: '1px solid var(--gray-6)',
      color: 'var(--gray-11)',
    },
    // Search-and-replace and the autocomplete list are panels floating over the document, so they take
    // the raised-chrome surface rather than the page.
    '.cm-panels': {
      backgroundColor: 'var(--gray-2)',
      color: 'var(--gray-12)',
      borderColor: 'var(--gray-6)',
    },
    '.cm-searchMatch': {
      backgroundColor: 'var(--warning-4)',
      outline: '1px solid var(--warning-8)',
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'var(--warning-6)',
    },
    '.cm-tooltip': {
      backgroundColor: 'var(--gray-2)',
      color: 'var(--gray-12)',
      border: '1px solid var(--gray-6)',
      borderRadius: 'var(--radius-sm)',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: 'var(--accent-3)',
      color: 'var(--accent-11)',
    },
  })
}
