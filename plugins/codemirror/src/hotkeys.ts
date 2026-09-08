import type { HotkeyBinding } from '@arxhub/plugin-hotkeys/ui'

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
export function codemirrorBindings(isNote: () => boolean): HotkeyBinding[] {
  return [
    { id: 'codemirror.bold', chord: 'Mod-b', layer: CODEMIRROR_LAYER, title: 'Bold', when: isNote },
    { id: 'codemirror.italic', chord: 'Mod-i', layer: CODEMIRROR_LAYER, title: 'Italic', when: isNote },
    { id: 'codemirror.inline-code', chord: 'Mod-e', layer: CODEMIRROR_LAYER, title: 'Inline code', when: isNote },
    { id: 'codemirror.insert-link', chord: 'Mod-Shift-k', layer: CODEMIRROR_LAYER, title: 'Insert link', when: isNote },
  ]
}
