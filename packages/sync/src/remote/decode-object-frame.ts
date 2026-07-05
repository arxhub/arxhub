import { validation } from '@arxhub/errors'
import { isObjectHash } from './is-object-hash'

const decoder = new TextDecoder()

// Inverse of encodeObjectFrame. Strict: a malformed or truncated frame throws ValidationError
// rather than yielding a partial map, so a corrupted transfer can never look like a smaller one.
export function decodeObjectFrame(frame: Uint8Array): Map<string, Uint8Array> {
  const objects = new Map<string, Uint8Array>()
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
  let offset = 0
  while (offset < frame.length) {
    if (offset + 68 > frame.length) throw validation('Truncated object frame header')
    const hash = decoder.decode(frame.subarray(offset, offset + 64))
    if (!isObjectHash(hash)) throw validation(`Invalid object hash in frame: ${hash}`)
    offset += 64
    const length = view.getUint32(offset)
    offset += 4
    if (offset + length > frame.length) throw validation('Truncated object frame payload')
    // slice (copy), not subarray: decoded objects must not retain the whole request buffer.
    objects.set(hash, frame.slice(offset, offset + length))
    offset += length
  }
  return objects
}
