import { describe, expect, it } from 'vitest'
import { type ChordSource, chordOf, formatChord, isBareKey, isReserved, normalizeChord, parseChord } from '../chord'

function keydown(over: Partial<ChordSource>): ChordSource {
  return { key: '', code: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...over }
}

describe('chord notation', () => {
  it('normalizes the modifier order so one chord has one spelling', () => {
    expect(normalizeChord('Shift-Alt-Mod-k')).toBe('Mod-Alt-Shift-k')
    expect(normalizeChord('Mod-B')).toBe('Mod-b')
    expect(normalizeChord('Escape')).toBe('Escape')
    expect(normalizeChord('Alt-Enter')).toBe('Alt-Enter')
  })

  it('reads a key that is itself a dash', () => {
    expect(parseChord('Mod--')).toEqual({ mod: true, alt: false, shift: false, key: '-' })
  })

  it('refuses a chord it cannot read rather than binding something else', () => {
    expect(() => parseChord('Hyper-k')).toThrow(/Unknown modifier/)
  })
})

describe('reading a chord off a keydown', () => {
  it('reads a letter off the physical key, so a Cyrillic layout still means Mod-b (A-35)', () => {
    // ⌘B on a Russian layout arrives as key 'и'. Matching on `key` would kill every letter chord
    // exactly while the owner is writing a note in Russian.
    expect(chordOf(keydown({ key: 'и', code: 'KeyB', metaKey: true }))).toBe('Mod-b')
    expect(chordOf(keydown({ key: 'ф', code: 'KeyA', ctrlKey: true }))).toBe('Mod-a')
    // And the Latin layout has to agree with it, or the two would be different bindings.
    expect(chordOf(keydown({ key: 'b', code: 'KeyB', metaKey: true }))).toBe('Mod-b')
  })

  it('reads everything that is not a letter off the key name', () => {
    expect(chordOf(keydown({ key: 'Escape', code: 'Escape' }))).toBe('Escape')
    expect(chordOf(keydown({ key: 'Enter', code: 'Enter', altKey: true }))).toBe('Alt-Enter')
    expect(chordOf(keydown({ key: 'F2', code: 'F2' }))).toBe('F2')
  })

  it('matches Mod as meta-or-ctrl, so no chord depends on sniffing the platform', () => {
    // A browser that reports the wrong platform — which Playwright's own Desktop Chrome profile does,
    // calling itself Windows on a Mac — must not take the whole keyboard down with it.
    expect(chordOf(keydown({ key: 'k', code: 'KeyK', metaKey: true }))).toBe('Mod-k')
    expect(chordOf(keydown({ key: 'k', code: 'KeyK', ctrlKey: true }))).toBe('Mod-k')
    // And a declared `Ctrl-` is the same chord, never a second unreachable one.
    expect(normalizeChord('Ctrl-k')).toBe('Mod-k')
  })

  it('is not a chord while only a modifier is down', () => {
    expect(chordOf(keydown({ key: 'Meta', code: 'MetaLeft', metaKey: true }))).toBeNull()
    expect(chordOf(keydown({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }))).toBeNull()
  })
})

describe('what may not be bound', () => {
  it('names the chords the system owns (F-10)', () => {
    for (const spec of ['Mod-w', 'Mod-n', 'Mod-t', 'Mod-q', 'Mod-h', 'Mod-m', 'F5', 'Mod-Shift-i']) {
      expect(isReserved(parseChord(spec))).toBe(true)
    }
    // ⌘K is a browser search bar and the product takes it deliberately: the line is "can we win it",
    // not "does anyone else want it".
    expect(isReserved(parseChord('Mod-k'))).toBe(false)
    expect(isReserved(parseChord('Mod-Shift-k'))).toBe(false)
  })

  it('calls a modifier-less printable key bare, and a named key not (A-38)', () => {
    expect(isBareKey(parseChord('n'))).toBe(true)
    expect(isBareKey(parseChord('Shift-n'))).toBe(true)
    expect(isBareKey(parseChord('Escape'))).toBe(false)
    expect(isBareKey(parseChord('F2'))).toBe(false)
    expect(isBareKey(parseChord('Mod-n'))).toBe(false)
  })
})

describe('the label a person reads', () => {
  it('draws the chord per platform, from one place', () => {
    expect(formatChord('Mod-b', 'mac')).toBe('⌘B')
    expect(formatChord('Mod-b', 'other')).toBe('Ctrl+B')
    expect(formatChord('Mod-Shift-k', 'mac')).toBe('⌘⇧K')
    expect(formatChord('Mod-Shift-k', 'other')).toBe('Ctrl+Shift+K')
    expect(formatChord('Alt-Enter', 'mac')).toBe('⌥Enter')
    expect(formatChord('Escape', 'other')).toBe('Escape')
  })
})
