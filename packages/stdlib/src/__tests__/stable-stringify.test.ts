import { describe, expect, test } from 'vitest'
import { stableStringify } from '../record/stable-stringify'

describe('stableStringify', () => {
  test('empty object matches JSON.stringify (the sync empty-snapshot base case)', () => {
    expect(stableStringify({})).toEqual('{}')
    expect(stableStringify({})).toEqual(JSON.stringify({}))
  })

  test('is independent of key insertion order', () => {
    const a = { b: 1, a: 2, c: { z: 1, y: 2 } }
    const b = { c: { y: 2, z: 1 }, a: 2, b: 1 }
    expect(stableStringify(a)).toEqual(stableStringify(b))
  })

  test('produces a stable golden string for a known value (cross-device hash stability)', () => {
    // If this literal changes, snapshot hashes change across versions — make sure that is intended.
    expect(stableStringify({ files: { 'b.txt': { hash: '2' }, 'a.txt': { hash: '1' } } })).toEqual(
      '{"files":{"a.txt":{"hash":"1"},"b.txt":{"hash":"2"}}}',
    )
  })

  test('preserves array order while sorting nested object keys', () => {
    expect(stableStringify([{ b: 1, a: 2 }, 3, 'x'])).toEqual('[{"a":2,"b":1},3,"x"]')
  })

  test('handles primitives and null like JSON.stringify', () => {
    expect(stableStringify(null)).toEqual('null')
    expect(stableStringify(42)).toEqual('42')
    expect(stableStringify('hi')).toEqual('"hi"')
  })
})
