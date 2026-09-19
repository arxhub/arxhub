import { shallowRef } from 'vue'

// Which desktop entry's keypad is up. Desktop Security settings holds two entries; mobile instead
// presents one step with its keypad always visible. Desktop entries do not know about each
// other — so this lives beside them rather than in either. It is module state and not a `<script setup>`
// binding because that block is a per-instance setup(), which would give every entry its own copy.
//
// Deliberately NOT cleared when an entry loses focus: a pad that folds away on mousedown moves whatever
// sat under the pointer, and the mouseup then lands somewhere else — so the click aimed at the button
// below the pad never happens at all.
export const openPad = shallowRef<symbol | null>(null)
