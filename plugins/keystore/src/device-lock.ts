import { EncryptedKeyStore, hasVerifier } from './encrypted-key-store'
import { unlockCodeTooShort, unlockFailed } from './errors'
import type { KeyStore } from './keystore'

// Six is the floor, not a recommendation. A six-digit PIN costs an attacker who already holds a copy
// of the storage roughly a day of one core (see the scrypt note in @arxhub/crypto kdf) — enough to
// deter someone who stumbles onto a synced browser profile, not someone who came for this vault. The
// unlock field accepts any string, so a passphrase is the way to actually be safe.
export const MIN_UNLOCK_CODE_LENGTH = 6

// Whether this store is locked, i.e. its values are ciphertext and a code is needed to read them.
export function isDeviceLocked(inner: KeyStore): Promise<boolean> {
  return hasVerifier(inner)
}

// Open a locked store. Rejects with unlockFailed on a wrong code — never returns a store that cannot
// actually decrypt, so callers can boot on the result without a second failure mode later.
export async function unlockDeviceKeyStore(inner: KeyStore, code: string): Promise<KeyStore> {
  const store = new EncryptedKeyStore(inner, code)
  if (!(await store.verifyCode())) throw unlockFailed()
  return store
}

// Encrypt an until-now-plaintext store in place and return the locked view of it.
export async function enableDeviceLock(inner: KeyStore, code: string): Promise<KeyStore> {
  requireLongEnough(code)
  if (await hasVerifier(inner)) throw unlockFailed(undefined, 'This device is already locked.')

  const values = await readAll(inner)
  const store = new EncryptedKeyStore(inner, code)
  for (const [name, value] of values) await store.set(name, value)
  // Written last so an interrupted migration leaves the store reading as unlocked rather than
  // presenting a working lock over entries that were never re-encrypted.
  await store.writeVerifier()
  return store
}

// Re-encrypt every value under a new code. The old ciphertext is only ever replaced by new
// ciphertext — nothing is written back in the clear along the way.
export async function changeUnlockCode(inner: KeyStore, currentCode: string, newCode: string): Promise<KeyStore> {
  requireLongEnough(newCode)

  const current = new EncryptedKeyStore(inner, currentCode)
  if (!(await current.verifyCode())) throw unlockFailed()

  const values = await readAll(current)
  // Drops the salt too, so the new store derives against a fresh one rather than reusing the old.
  await current.removeVerifier()

  const next = new EncryptedKeyStore(inner, newCode)
  for (const [name, value] of values) await next.set(name, value)
  await next.writeVerifier()
  return next
}

// Decrypt everything back to plaintext at rest and return the now-unlocked inner store.
export async function disableDeviceLock(inner: KeyStore, code: string): Promise<KeyStore> {
  const store = new EncryptedKeyStore(inner, code)
  if (!(await store.verifyCode())) throw unlockFailed()

  const values = await readAll(store)
  await store.removeVerifier()
  for (const [name, value] of values) await inner.set(name, value)
  return inner
}

// Last resort for a forgotten code: throw away every secret this device holds. The identity goes with
// it, so whatever was encrypted under the old mnemonic is unreachable unless the phrase was saved.
export async function resetDeviceKeyStore(inner: KeyStore): Promise<void> {
  for (const name of await inner.list()) await inner.delete(name)
}

async function readAll(store: KeyStore): Promise<[string, string][]> {
  const entries: [string, string][] = []
  for (const name of await store.list()) {
    const value = await store.get(name)
    if (value != null) entries.push([name, value])
  }
  return entries
}

function requireLongEnough(code: string): void {
  if (code.length < MIN_UNLOCK_CODE_LENGTH) throw unlockCodeTooShort(MIN_UNLOCK_CODE_LENGTH)
}
