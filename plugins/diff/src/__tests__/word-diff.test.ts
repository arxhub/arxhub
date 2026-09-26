import { describe, expect, test } from 'vitest'
import type { InlineSegment } from '../model'
import { decodeText, wordDiff } from '../word-diff'

const before = (segments: InlineSegment[]) =>
  segments
    .filter((it) => it.kind !== 'added')
    .map((it) => it.text)
    .join('')
const after = (segments: InlineSegment[]) =>
  segments
    .filter((it) => it.kind !== 'removed')
    .map((it) => it.text)
    .join('')

describe('wordDiff', () => {
  test('marks the changed word and keeps the surrounding text equal', () => {
    expect(wordDiff('Настройки — вкладка', 'Настройки — раздел')).toEqual([
      { kind: 'equal', text: 'Настройки — ' },
      { kind: 'removed', text: 'вкладка' },
      { kind: 'added', text: 'раздел' },
    ])
  })

  test('a rewritten phrase is one removal and one addition, not shreds around each space', () => {
    expect(wordDiff('было три слова', 'стало два иных')).toEqual([
      { kind: 'removed', text: 'было три слова' },
      { kind: 'added', text: 'стало два иных' },
    ])
  })

  test('both texts are rebuilt exactly from the segments', () => {
    const segments = wordDiff('показывается только у активного типа.', 'показывается у каждого типа в ряду.')
    expect(before(segments)).toBe('показывается только у активного типа.')
    expect(after(segments)).toBe('показывается у каждого типа в ряду.')
  })

  test('whitespace shared at the edges of an edit stays outside the marks', () => {
    const segments = wordDiff('a old b', 'a new b')
    expect(segments).toEqual([
      { kind: 'equal', text: 'a ' },
      { kind: 'removed', text: 'old' },
      { kind: 'added', text: 'new' },
      { kind: 'equal', text: ' b' },
    ])
  })

  test('reads Cyrillic and digits as whole words', () => {
    expect(wordDiff('сумма 351', 'сумма 1351')).toEqual([
      { kind: 'equal', text: 'сумма ' },
      { kind: 'removed', text: '351' },
      { kind: 'added', text: '1351' },
    ])
  })

  test('a pure insertion carries no removal', () => {
    const segments = wordDiff('в ряду.', 'в ряду, не больше четырёх.')
    expect(segments.some((it) => it.kind === 'removed')).toBe(false)
    expect(after(segments)).toBe('в ряду, не больше четырёх.')
  })

  test('identical text is one equal segment; empty text is none', () => {
    expect(wordDiff('same', 'same')).toEqual([{ kind: 'equal', text: 'same' }])
    expect(wordDiff('', '')).toEqual([])
  })
})

describe('decodeText', () => {
  test('decodes UTF-8', () => {
    expect(decodeText(new TextEncoder().encode('Привет'))).toBe('Привет')
  })

  test('refuses a NUL and invalid UTF-8', () => {
    expect(decodeText(new Uint8Array([0x61, 0x00, 0x62]))).toBeNull()
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x00]))).toBeNull()
    expect(decodeText(new Uint8Array([0xc3]))).toBeNull()
  })
})
