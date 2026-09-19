import { describe, expect, test } from 'vitest'
import { DEFAULT_TEXT_EXTENSIONS, textMerger, toTextExtensions } from '../text-merger'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const bytes = (text: string) => encoder.encode(text)

describe('toTextExtensions', () => {
  test('an absent setting is the default list', () => {
    expect(toTextExtensions(undefined)).toEqual(new Set(DEFAULT_TEXT_EXTENSIONS))
  })

  test('an empty list is empty — the owner switched text merging off, not back to the default', () => {
    expect(toTextExtensions([])).toEqual(new Set())
  })

  test('a leading dot, case and blanks are what a person types, not what a path is compared against', () => {
    expect(toTextExtensions(['.MD', ' txt ', '', '.', 'Markdown'])).toEqual(new Set(['md', 'txt', 'markdown']))
  })
})

describe('textMerger', () => {
  test('matches by the extension of the repo path, case-insensitively, against the LIVE set', () => {
    let extensions: ReadonlySet<string> = new Set(['md'])
    const merger = textMerger(() => extensions)

    expect(merger.id).toBe('text')
    expect(merger.fallback).toBe(true)
    expect(merger.matches('vault/notes/a.md')).toBe(true)
    expect(merger.matches('vault/notes/A.MD')).toBe(true)
    expect(merger.matches('vault/notes/a.txt')).toBe(false)
    expect(merger.matches('vault/notes/md')).toBe(false)
    expect(merger.matches('vault/.md')).toBe(false)

    extensions = new Set(['txt'])
    expect(merger.matches('vault/notes/a.md')).toBe(false)
    expect(merger.matches('vault/notes/a.txt')).toBe(true)
  })

  test('merges line by line and reports the conflict count', async () => {
    const merger = textMerger(() => new Set(['md']))
    const result = await merger.merge('vault/a.md', bytes('a\nb\nc\n'), bytes('A\nb\nc\n'), bytes('a\nb\nC\n'))
    expect(result && decoder.decode(result.merged)).toBe('A\nb\nC\n')
    expect(result?.conflicts).toBe(0)

    const conflicted = await merger.merge('vault/a.md', bytes('a\n'), bytes('L\n'), bytes('R\n'))
    expect(conflicted?.conflicts).toBe(1)
  })

  test('declines without a common ancestor — a line union would be guesswork', async () => {
    const merger = textMerger(() => new Set(['md']))
    expect(await merger.merge('vault/a.md', null, bytes('a\n'), bytes('b\n'))).toBeNull()
  })

  test('declines when a side is not UTF-8 text', async () => {
    const merger = textMerger(() => new Set(['md']))
    const invalid = new Uint8Array([0x61, 0xff, 0xfe, 0x0a])
    expect(await merger.merge('vault/a.md', bytes('a\n'), invalid, bytes('b\n'))).toBeNull()
    expect(await merger.merge('vault/a.md', bytes('a\n'), bytes('b\n'), invalid)).toBeNull()
    expect(await merger.merge('vault/a.md', invalid, bytes('a\n'), bytes('b\n'))).toBeNull()
  })

  test('declines when a side carries a NUL byte — valid UTF-8, but not a text file', async () => {
    const merger = textMerger(() => new Set(['md']))
    expect(await merger.merge('vault/a.md', bytes('a\n'), bytes('a\0b\n'), bytes('b\n'))).toBeNull()
  })

  test('keeps a byte-order mark where it was', async () => {
    const merger = textMerger(() => new Set(['md']))
    const result = await merger.merge('vault/a.md', bytes('﻿a\nb\n'), bytes('﻿A\nb\n'), bytes('﻿a\nb\nc\n'))
    // A default TextDecoder swallows the BOM it is being asked about, so read it with one that does not.
    expect(result && new TextDecoder('utf-8', { ignoreBOM: true }).decode(result.merged)).toBe('﻿A\nb\nc\n')
  })
})
