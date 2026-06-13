import { describe, expect, test } from 'vitest'
import { deserializeCursor, serializeCursor } from '../virtual-walker/interface'

describe('cursor serialization', () => {
  test('round-trips ASCII pathnames', () => {
    const state = { queue: ['a/b', 'c'], pending: ['a/b/file.txt'] }
    expect(deserializeCursor(serializeCursor(state))).toEqual(state)
  })

  test('round-trips non-ASCII pathnames (btoa would otherwise throw)', () => {
    // A Cyrillic + emoji filename: btoa(JSON.stringify(...)) throws InvalidCharacterError on these.
    const state = { queue: ['заметки/папка'], pending: ['заметки/файл-📝.md'] }
    const token = serializeCursor(state)
    expect(deserializeCursor(token)).toEqual(state)
  })

  test('returns empty state for a malformed token', () => {
    expect(deserializeCursor('!!!not base64!!!')).toEqual({ queue: [], pending: [] })
  })

  test('rejects a wrong-shaped payload instead of trusting it', () => {
    const token = serializeCursor({ queue: ['ok'], pending: [42 as unknown as string] })
    expect(deserializeCursor(token)).toEqual({ queue: [], pending: [] })
  })

  test('rejects an over-cap payload', () => {
    const huge = Array.from({ length: 100_001 }, (_, i) => String(i))
    const token = serializeCursor({ queue: huge, pending: [] })
    expect(deserializeCursor(token)).toEqual({ queue: [], pending: [] })
  })
})
