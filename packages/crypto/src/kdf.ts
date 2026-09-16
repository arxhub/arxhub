import { scrypt } from '@noble/hashes/scrypt.js'
import { randomBytes, utf8ToBytes } from '@noble/hashes/utils.js'

const SALT_BYTES = 16
const KEY_BYTES = 32 // AES-256

// scrypt cost parameters. N = 2^16 costs 64 MiB and ~130 ms on a 2026 laptop — the memory is the
// point: it is what denies an attacker the massive parallelism of a GPU or ASIC. 64 MiB (not 128)
// because this must also derive inside a low-end Android webview without being killed. r/p are the
// conventional defaults. Baked in, not configurable, so a value derived on one device reproduces on
// another from the same passphrase + salt.
//
// What the device lock actually buys, since the code it derives from is a PIN of 6 digits or more
// (the keypad is the only input there is — see MIN_UNLOCK_CODE_LENGTH in plugins/keystore). At these
// parameters a full 6-digit sweep is ~36 core-hours — hours, not years, on a machine an attacker can
// rent. So the PIN is real protection against someone who merely gets a copy of the storage (a synced
// browser profile, a borrowed laptop) and no protection against someone who targets you and is willing
// to spend an afternoon. The unlock screen says exactly that rather than implying more.
const SCRYPT_N = 1 << 16
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
