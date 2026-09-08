import type { HotkeyBinding } from '@arxhub/plugin-hotkeys/ui'

export const PROSEMIRROR_LAYER = 'editor:arxhub.editor'

// What the `.arx` editor's own keymap takes, declared rather than handed over (F-06) — the same
// arrangement as the markdown editor's, for the same reason: ProseMirror calls `preventDefault` on a
// chord it handled but never `stopPropagation`, so before this the one keystroke reached the window
// listener as well and did two things at once.
//
// The plain text-editing keys `buildKeymap` also sets — Enter, Tab, Shift-Tab — are deliberately
// absent. What happens to text inside an editor belongs to the editor; the registry owns the chords
// of the APPLICATION, and a list that reached down to Enter would be the beginning of the registry
// learning about the caret.
export const PROSEMIRROR_BINDINGS: HotkeyBinding[] = [
  { id: 'editor.bold', chord: 'Mod-b', layer: PROSEMIRROR_LAYER, title: 'Bold' },
  { id: 'editor.italic', chord: 'Mod-i', layer: PROSEMIRROR_LAYER, title: 'Italic' },
  { id: 'editor.code', chord: 'Mod-`', layer: PROSEMIRROR_LAYER, title: 'Inline code' },
  { id: 'editor.heading-1', chord: 'Mod-Alt-1', layer: PROSEMIRROR_LAYER, title: 'Heading 1' },
  { id: 'editor.heading-2', chord: 'Mod-Alt-2', layer: PROSEMIRROR_LAYER, title: 'Heading 2' },
  { id: 'editor.heading-3', chord: 'Mod-Alt-3', layer: PROSEMIRROR_LAYER, title: 'Heading 3' },
  { id: 'editor.undo', chord: 'Mod-z', layer: PROSEMIRROR_LAYER, title: 'Undo' },
  { id: 'editor.redo', chord: 'Mod-Shift-z', layer: PROSEMIRROR_LAYER, title: 'Redo' },
  { id: 'editor.redo-alt', chord: 'Mod-y', layer: PROSEMIRROR_LAYER, title: 'Redo' },
]
