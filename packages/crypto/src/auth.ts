import { sha256 } from '@noble/hashes/sha2.js'
import { HDKey } from '@scure/bip32'

// Server-side signature check. `authPublicKey` is the client's xpub captured at pairing (no private
// material), so the server stays zero-knowledge. Reconstructs a verify-only HDKey and checks the
// ECDSA signature over sha256(message). Returns false on any malformed key/signature — callers treat
// a false as "denied" rather than distinguishing failure modes an attacker could probe.
export function verifyAuth(authPublicKey: string, message: Uint8Array, signature: Uint8Array): boolean {
  try {
    return HDKey.fromExtendedKey(authPublicKey).verify(sha256(message), signature)
  } catch {
    return false
  }
}
