import type { HotkeyBinding, HotkeysExtension } from '@arxhub/plugin-hotkeys/ui'

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
  { id: 'editor.find', chord: 'Mod-f', layer: PROSEMIRROR_LAYER, title: 'Find in document' },
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

// Declared ONCE for the viewer type, from `configure()`, and never from a panel's `onMounted`.
//
// A chord is a fact about the type — every `.arx` panel there will ever be handles `Mod-b` the same
// way — while a mounted panel is one OCCURRENCE of the layer, and the registry already keeps those
// apart: `register` records what the layer claims, `pushLayer` records where the layer currently is.
// Two open notes are two occurrences, and both stay mounted (panels keep every instance alive and
// `TypeStage` hides its stages with `v-show`), so declaring per mount registered these nine bindings
// twice — the second set refused as a collision with the first — and then the FIRST note's unmount
// disposed the surviving copy. From that moment ⌘B in the still-open second note collapsed the
// navigation column again: the bug this layer exists to fix, resurrected by closing an unrelated tab.
export function declareProseMirrorChords(hotkeys: HotkeysExtension): void {
  for (const binding of PROSEMIRROR_BINDINGS) hotkeys.register(binding)
}
