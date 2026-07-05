import { validation } from '@arxhub/errors'
import { isObjectHash } from './is-object-hash'

const encoder = new TextEncoder()

// Binary batch format for moving objects over HTTP in ONE request (vs one request per blob):
// a repetition of records, no header — `[64-byte ascii hex hash][u32 BE payload length][payload]`.
// Shared by HttpSyncRemote (encode puts / decode gets) and the server routes (the mirror image).
export function encodeObjectFrame(objects: Map<string, Uint8Array>): Uint8Array {
  let total = 0
  for (const [, bytes] of objects) {
    total += 64 + 4 + bytes.length
  }

  const frame = new Uint8Array(total)
  const view = new DataView(frame.buffer)
  let offset = 0
  for (const [hash, bytes] of objects) {
    if (!isObjectHash(hash)) throw validation(`Invalid object hash: ${hash}`)
    encoder.encodeInto(hash, frame.subarray(offset, offset + 64))
    offset += 64
    view.setUint32(offset, bytes.length)
    offset += 4
    frame.set(bytes, offset)
    offset += bytes.length
  }
  return frame
}
