import type { HotkeyBinding, HotkeysExtension } from '@arxhub/plugin-hotkeys'

export const CODEMIRROR_LAYER = 'editor:arxhub.codemirror'

// What the markdown note editor's own keymap takes, declared rather than handed over (F-06).
//
// None of these carries a `run`: CodeMirror executes them, and the registry only needs to KNOW they
// are taken. That buys the two things this initiative is for and costs nothing inside the editor —
// the layer above the app's stops ⌘B from bolding the word AND collapsing the navigation column in
// one keystroke, and a second claim on any of them shows up as a collision at start-up.
//
// Handing them over instead would mean rewriting both editor integrations to take on keymap
// precedence (`Prec.high` here is already load-bearing — ⌘⇧K is `deleteLine` in CodeMirror's own
// defaults), composed input, and two different command models. The user would notice nothing.
//
// Only the profile's OWN chords are listed. What `basicSetup` installs underneath is CodeMirror's
// business and is not visible from here; a collision inside it — which is exactly how ⌘⇧K emptied the
// line before it was moved — is caught by using the editor, not by this list.
export const CODEMIRROR_BINDINGS: HotkeyBinding[] = [
  { id: 'codemirror.bold', chord: 'Mod-b', layer: CODEMIRROR_LAYER, title: 'Bold' },
  { id: 'codemirror.italic', chord: 'Mod-i', layer: CODEMIRROR_LAYER, title: 'Italic' },
  { id: 'codemirror.inline-code', chord: 'Mod-e', layer: CODEMIRROR_LAYER, title: 'Inline code' },
  { id: 'codemirror.insert-link', chord: 'Mod-Shift-k', layer: CODEMIRROR_LAYER, title: 'Insert link' },
]

// Declared ONCE for the viewer type, from `configure()`, and never from an editor's `onMounted`: a
// chord is a fact about the type, while a mounted editor is one OCCURRENCE of the layer, and several
// occurrences are the normal case rather than an edge one. The whole reason, and what a per-mount
// declaration cost, is written down in the editor plugin's `declareProseMirrorChords`.
//
// A code file claims none of this, and that rule did not disappear with the `when` these bindings used
// to carry — it moved to where it is now true by construction. `Prec.high(keymap.of(markdownKeymap))`
// is installed for a note alone, so `CodeMirrorEditor` pushes this layer for a note alone, and over a
// `.ts` file the chord falls through to the app layer and collapses the column as it does everywhere
// else. It had to move: the layer id is shared by every open editor, so the registry holds ONE entry
// per chord for all of them, and a `when` closed over one panel's file would have decided for panels
// showing a different one — mount order deciding behaviour, which is the accident this registry
// replaced.
export function declareCodeMirrorChords(hotkeys: HotkeysExtension): void {
  for (const binding of CODEMIRROR_BINDINGS) hotkeys.register(binding)
}
