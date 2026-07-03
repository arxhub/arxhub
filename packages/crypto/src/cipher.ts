import { gcm } from '@noble/ciphers/aes.js'
import { randomBytes } from '@noble/hashes/utils.js'
import { decryptionFailed } from './errors'

// 96-bit nonce — the standard/optimal IV size for AES-GCM.
const IV_BYTES = 12

// AES-256-GCM. Output layout: [ iv (12 bytes) | ciphertext+tag ]. A fresh random IV per call keeps
// encryptions of identical plaintext distinct; GCM's auth tag means a wrong key or any tampering
// fails loudly on decrypt rather than returning garbage. `key` must be 32 bytes (AES-256).
export function encrypt(key: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const iv = randomBytes(IV_BYTES)
  const ciphertext = gcm(key, iv).encrypt(plaintext)
  const out = new Uint8Array(iv.length + ciphertext.length)
  out.set(iv, 0)
  out.set(ciphertext, iv.length)
  return out
}

export function decrypt(key: Uint8Array, blob: Uint8Array): Uint8Array {
  if (blob.length <= IV_BYTES) throw decryptionFailed(undefined, 'Ciphertext too short')
  const iv = blob.subarray(0, IV_BYTES)
  const ciphertext = blob.subarray(IV_BYTES)
  try {
    return gcm(key, iv).decrypt(ciphertext)
  } catch (error) {
    throw decryptionFailed(error)
  }
}
