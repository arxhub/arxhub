import { scrypt } from '@noble/hashes/scrypt.js'
import { randomBytes, utf8ToBytes } from '@noble/hashes/utils.js'

const SALT_BYTES = 16
const KEY_BYTES = 32 // AES-256

// scrypt cost parameters. N = 2^15 targets ~tens of ms on a laptop — enough that brute-forcing a
// stolen ciphertext vault is expensive, without making an interactive unlock feel slow. r/p are the
// conventional defaults. These are baked in (not configurable) so a value derived on one device
// reproduces on another from the same passphrase + salt.
const SCRYPT_N = 1 << 15
const SCRYPT_R = 8
const SCRYPT_P = 1

// A fresh random salt for a new encrypted store. Not secret — persisted alongside the ciphertext so
// the same passphrase re-derives the same key on the next unlock.
export function generateSalt(): Uint8Array {
  return randomBytes(SALT_BYTES)
}

// Derive a 32-byte AES-256 key from a human passphrase and a per-store salt via scrypt (memory-hard).
// Deterministic for a given (passphrase, salt): the same inputs always yield the same key, so an
// encrypted store unlocks with the passphrase alone once its salt is known. Pair with encrypt/decrypt.
export function deriveKeyFromPassphrase(passphrase: string, salt: Uint8Array): Uint8Array {
  return scrypt(utf8ToBytes(passphrase), salt, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, dkLen: KEY_BYTES })
}
