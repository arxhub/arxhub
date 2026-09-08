import { APP_LAYER, HotkeysExtension, useHotkeyLayer, useHotkeys } from '@arxhub/plugin-hotkeys/ui'
import { useArxHub } from '@arxhub/uikit/hooks'
import type { Ref } from 'vue'

// The shell's side of the keyboard: the layer ids both frames push, and the two chords the frame owns.
//
// The ids live here rather than being spelled out at each site for the same reason `SETTINGS_TYPE_ID`
// does: a plugin that binds a chord inside its own type has to name the layer the frame pushed for it,
// and a string typed twice is a binding that silently never fires.

// A navigation type's layer. Pushed by `TypeStageView` — one place for every type there will ever be —
// and up while that type's stage is on screen, which is exactly "this is the type you are in".
export function typeLayerId(typeId: string): string {
  return `type:${typeId}`
}

// A layer over the content: a sheet, a dialog, a menu. Modal, so nothing under it resolves.
export function overlayLayerId(id: string): string {
  return `layer:${id}`
}

export const SHEET_LAYER = overlayLayerId('shell.sheet')

export function useHotkeysExtension(): HotkeysExtension {
  return useArxHub().extensions.get(HotkeysExtension)
}

// ⌘K, the one operation that is the same in both frames: open, or switch to. Declared in the `app`
// layer, so it works from anywhere the layer above has not claimed it — including from inside a note.
//
// It used to be a window listener, and its comment carried a known risk: it worked only because
// CodeMirror calls `preventDefault` without `stopPropagation`, so a chord the editor had consumed
// still reached the window. That risk is gone with the listener — the order is now the layer stack's,
// not a library's — and so is the special case for Shift, which existed because ⌘⇧K is the editor's
// own insert-link chord: a different chord is simply a different entry.
export function useOpenSheetKey(open: () => void): void {
  useHotkeys(useHotkeysExtension(), [{ id: 'shell.open-sheet', chord: 'Mod-k', layer: APP_LAYER, title: 'Open or switch to', run: open }])
}

// The sheet, while it is up, is the only thing the keyboard talks to. Pushed from the list rather than
// from the container because the container is a uikit `Dialog` — the frame owns the layer, uikit owns
// the control, and neither direction of that dependency is reversed (F-09).
export function useSheetLayer(element: Ref<HTMLElement | null>): void {
  useHotkeyLayer(useHotkeysExtension(), { id: SHEET_LAYER, kind: 'layer', modal: true }, element)
}
