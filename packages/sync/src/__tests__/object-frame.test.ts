import { hasErrorCode } from '@arxhub/errors'
import { describe, expect, test } from 'vitest'
import { decodeObjectFrame } from '../remote/decode-object-frame'
import { encodeObjectFrame } from '../remote/encode-object-frame'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b1'.repeat(32)

describe('object frame codec', () => {
  test('round-trips a batch, preserving order and bytes', () => {
    const objects = new Map<string, Uint8Array>([
      [HASH_A, new TextEncoder().encode('hello world')],
      [HASH_B, new Uint8Array(0)], // empty payloads are legal
    ])

    const decoded = decodeObjectFrame(encodeObjectFrame(objects))

    expect([...decoded.keys()]).toEqual([HASH_A, HASH_B])
    expect(new TextDecoder().decode(decoded.get(HASH_A))).toEqual('hello world')
    expect(decoded.get(HASH_B)).toEqual(new Uint8Array(0))
  })

  test('encodes an empty batch to an empty frame', () => {
    expect(encodeObjectFrame(new Map())).toEqual(new Uint8Array(0))
    expect(decodeObjectFrame(new Uint8Array(0)).size).toBe(0)
  })

  test('rejects encoding under a malformed hash', () => {
    const objects = new Map([['not-a-hash', new Uint8Array([1])]])
    try {
      encodeObjectFrame(objects)
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(hasErrorCode(e, 'ValidationError')).toBe(true)
    }
  })

  test('rejects a truncated frame instead of yielding a partial map', () => {
    const frame = encodeObjectFrame(new Map([[HASH_A, new TextEncoder().encode('hello world')]]))
    try {
      decodeObjectFrame(frame.subarray(0, frame.length - 3))
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(hasErrorCode(e, 'ValidationError')).toBe(true)
    }
  })

  test('rejects a frame whose hash field is not hex', () => {
    const frame = encodeObjectFrame(new Map([[HASH_A, new Uint8Array([1, 2, 3])]]))
    frame[0] = 'Z'.charCodeAt(0)
    try {
      decodeObjectFrame(frame)
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(hasErrorCode(e, 'ValidationError')).toBe(true)
    }
  })
})
