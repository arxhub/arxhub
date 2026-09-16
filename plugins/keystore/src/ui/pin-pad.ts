import { shallowRef } from 'vue'

// Which entry's keypad is up, across every entry on screen. Security settings holds two of them and two
// keypads would be two places to look for the digit just pressed, but the entries do not know about each
// other — so this lives beside them rather than in either. It is module state and not a `<script setup>`
// binding because that block is a per-instance setup(), which would give every entry its own copy.
//
// Deliberately NOT cleared when an entry loses focus: a pad that folds away on mousedown moves whatever
// sat under the pointer, and the mouseup then lands somewhere else — so the click aimed at the button
// below the pad never happens at all.
export const openPad = shallowRef<symbol | null>(null)
