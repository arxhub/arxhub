import { sha256 as nobleSha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

// Hex SHA-256 of a string (UTF-8) or raw bytes. Pure-JS (@noble/hashes) so it runs in the browser as
// well as node — the sync engine and publisher hash content on both sides and the same input must
// yield the same hex everywhere. (Previously used node:crypto, which crashed the browser client at
// import time via EMPTY_SNAPSHOT_HASH.)
export function sha256(data: string | Uint8Array): string {
  return bytesToHex(nobleSha256(typeof data === 'string' ? utf8ToBytes(data) : data))
}
