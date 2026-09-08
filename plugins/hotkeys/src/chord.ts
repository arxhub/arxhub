// The canonical chord notation, and the only place a key event is turned into one.
//
// The notation is CodeMirror's `Mod-` form — `Mod-b`, `Mod-Shift-k`, `Alt-Enter`, `F2`, `Escape` —
// taken because both editors already declare their keymaps in it (`CodeMirrorEditor.vue`,
// `editor-keymap.ts`). Declaring the same chord in two spellings would mean translating one into the
// other every time a registration is checked against a library's own map, which is the check this
// whole registry exists to make possible.

export type Platform = 'mac' | 'other'

// Everything the resolver reads off a keydown. A plain shape rather than `KeyboardEvent`, so the
// notation is testable without a DOM — which is the whole reason the rules live in this file.
export interface ChordSource {
  readonly key: string
  readonly code: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

// Fixed modifier order, so one chord has exactly one spelling and a lookup is string equality.
const ORDER = ['Mod', 'Alt', 'Shift'] as const

// Held down rather than pressed: a chord is never one of these on its own.
const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift', 'AltGraph', 'CapsLock', 'OS'])

// Chords the product cannot win, refused at registration rather than observed failing (F-10). Some
// never arrive — the browser has closed the tab before the page hears anything — and the rest take
// focus out of the window. A binding to one of them is a promise the product cannot keep.
//
// Not a list of everything a browser uses: ⌘K is a browser search bar and the product takes it
// deliberately. The line is "can we win it at all", not "does anyone else want it".
const RESERVED = new Set([
  'Mod-w',
  'Mod-n',
  'Mod-t',
  'Mod-q',
  'Mod- ',
  'Mod-h',
  'Mod-m',
  'F5',
  'Mod-Shift-i',
  'Mod-Shift-j',
  'Mod-Shift-c',
  'Mod-Shift-n',
  'Mod-Shift-t',
  'Mod-Shift-w',
])

export class ChordError extends Error {}

export interface Chord {
  // ⌘ on macOS, Ctrl everywhere else — and MATCHED as `metaKey || ctrlKey`, which is exactly the test
  // the four window listeners this replaced each wrote out by hand.
  //
  // Deliberately not "whichever the detected platform says". Platform detection is a guess off the user
  // agent, and a wrong guess there would kill every chord in the product at once — a browser reporting
  // Windows while the keys under the person's hands are a Mac's is not exotic, it is what Playwright's
  // own Desktop Chrome profile does. The cost is that ⌃K on macOS also resolves, as it always has; the
  // benefit is that no chord is ever one bad sniff away from dead. The platform decides how the chord is
  // DRAWN, where being wrong costs a label rather than the keyboard.
  readonly mod: boolean
  readonly alt: boolean
  readonly shift: boolean
  // A single lower-case character, or a `KeyboardEvent.key` name as written there: 'Escape', 'Enter',
  // 'F2', 'ArrowUp'.
  readonly key: string
}

// Parse a declared chord into its canonical spelling. Throws on nonsense, because a chord is written
// by a developer in source and a typo there must not become a binding that silently never fires.
export function parseChord(spec: string): Chord {
  // Split at the last dash that is not the final character: the key itself may BE a dash ('Mod--'),
  // and a plain `split('-')` turns that into empty parts nobody can tell from a typo.
  const at = spec.lastIndexOf('-', spec.length - 2)
  const rawKey = at === -1 ? spec : spec.slice(at + 1)
  const parts = at === -1 ? [] : spec.slice(0, at).split('-')
  const named = rawKey.length > 1 ? rawKey : rawKey.toLowerCase()
  let mod = false
  let alt = false
  let shift = false
  for (const part of parts) {
    switch (part.toLowerCase()) {
      case 'mod':
      case 'cmd':
      case 'meta':
        mod = true
        break
      // An alias, not a modifier of its own: `Mod` already matches Ctrl, so a separate `Ctrl-` chord
      // would be one no key press could ever produce.
      case 'ctrl':
      case 'control':
        mod = true
        break
      case 'alt':
      case 'option':
        alt = true
        break
      case 'shift':
        shift = true
        break
      default:
        throw new ChordError(`Unknown modifier "${part}" in chord "${spec}"`)
    }
  }
  if (named === '') throw new ChordError(`Chord "${spec}" names no key`)
  return { mod, alt, shift, key: named }
}

export function chordSpec(chord: Chord): string {
  return [...heldOf(chord), chord.key].join('-')
}

function heldOf(chord: Chord): string[] {
  return ORDER.filter((it) => (it === 'Mod' && chord.mod) || (it === 'Alt' && chord.alt) || (it === 'Shift' && chord.shift))
}

// A declared chord in canonical spelling — what the registry keys on.
export function normalizeChord(spec: string): string {
  return chordSpec(parseChord(spec))
}

// A chord nobody may register: it carries no modifier and its key types a character. Every such
// binding is a key that eats a letter somewhere the guard did not reach (A-38). A named key — Escape,
// F2, an arrow — types nothing and stays legal.
export function isBareKey(chord: Chord): boolean {
  return !chord.mod && !chord.alt && chord.key.length === 1
}

export function isReserved(chord: Chord): boolean {
  return RESERVED.has(chordSpec(chord))
}

// The chord a keydown stands for, or null when the key is not chord material (a modifier held on its
// own, or a dead key).
//
// A letter is read off `event.code`, everything else off `event.key` (A-35). With a Cyrillic layout
// ⌘B arrives as key 'и' — matching on `key` would kill every letter chord exactly while the owner is
// writing a note in Russian, which is the product's main scenario. `code` names the position of the
// key and does not move with the layout. The label shown to a person stays Latin: a chord is
// remembered as the letter it is called, not as whatever the current layout paints on that key.
export function chordOf(event: ChordSource): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null
  const letter = /^Key([A-Z])$/.exec(event.code)
  const key = letter != null ? letter[1].toLowerCase() : event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (key === '' || key === 'Dead' || key === 'Unidentified') return null
  return chordSpec({ mod: event.metaKey || event.ctrlKey, alt: event.altKey, shift: event.shiftKey, key })
}

const MAC_SIGNS: Record<string, string> = { Mod: '⌘', Alt: '⌥', Shift: '⇧' }

// The chord as a person reads it: `⌘⇧K` on macOS, `Ctrl+Shift+K` on Linux and Windows. One function,
// because the sign used to be typed into a template — `'Collapse navigation (⌘B)'` — which was simply
// wrong on two of the three platforms the product ships to.
export function formatChord(spec: string, platform: Platform): string {
  const chord = parseChord(spec)
  const key = chord.key.length === 1 ? chord.key.toUpperCase() : chord.key
  const held = heldOf(chord)
  if (platform === 'mac') return [...held.map((it) => MAC_SIGNS[it]), key].join('')
  return [...held.map((it) => (it === 'Mod' ? 'Ctrl' : it)), key].join('+')
}

// Which sign to draw `Mod` as. Only ever used for the LABEL — matching never asks, precisely so a
// wrong answer here costs a printed symbol and not the keyboard. Reads the modern hint first and falls
// back to the legacy one; 'other' where neither exists, since `Ctrl` is what a keyboard has when
// nothing says otherwise.
export function detectPlatform(): Platform {
  const nav: unknown = typeof navigator === 'undefined' ? null : navigator
  if (nav == null || typeof nav !== 'object') return 'other'
  const data = (nav as { userAgentData?: { platform?: string } }).userAgentData
  const name = data?.platform ?? (nav as { platform?: string }).platform ?? ''
  return /mac|iphone|ipad|ipod/i.test(name) ? 'mac' : 'other'
}
