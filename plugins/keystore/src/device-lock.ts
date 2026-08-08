import { CHECK_ENTRY, EncryptedKeyStore, hasVerifier, SALT_ENTRY } from './encrypted-key-store'
import { unlockCodeTooShort, unlockFailed } from './errors'
import type { KeyStore } from './keystore'

// Every name a migration below stages gets this prefix on the SAME underlying store, so a full
// re-encryption can be computed and verified before a single real entry changes. Nothing under a real
// name is touched until every staged value (including the verifier) exists — an interruption before
// that point leaves the device exactly as it was; nothing after it needs to run for the device to still
// be readable under whichever code already worked a moment ago.
const STAGING_PREFIX = '__staging__.'

function stagingView(inner: KeyStore): KeyStore {
  return {
    get: (name) => inner.get(STAGING_PREFIX + name),
    set: (name, value) => inner.set(STAGING_PREFIX + name, value),
    has: (name) => inner.has(STAGING_PREFIX + name),
    delete: (name) => inner.delete(STAGING_PREFIX + name),
    list: async () => (await inner.list()).filter((name) => name.startsWith(STAGING_PREFIX)).map((name) => name.slice(STAGING_PREFIX.length)),
  }
}

// Copy every staged entry onto the real store under its real name, then clear the staging area. Each
// individual `set` still isn't atomic with the others — but by the time this runs there is nothing left
// to COMPUTE, only bytes left to copy, so the risk window an interruption can land in is as small as
// this gets with a plain key/value store.
//
// Which half goes first depends on which side of the transition is SAFER to be caught mid-way, and it
// differs by direction:
//  - changeUnlockCode goes ordinary-first, verifier-last: the old code keeps working (old real entries
//    are still old ciphertext) until every value has an already-verified replacement waiting, matching
//    "the old code only stops working once every value it could read has a replacement" above. An
//    interruption after some ordinary values promoted leaves `hasVerifier` still true under the OLD
//    verifier, so a value promoted ahead of it now decrypts under the wrong key — a loud GCM failure —
//    while the untouched remainder still opens fine with the old code.
//  - enableDeviceLock has no "old ciphertext" to fall back on — the real entries before promotion are
//    PLAINTEXT — so it goes verifier-first instead: the moment `hasVerifier` flips true, any real entry
//    read through the new code's decryptor either matches (already promoted) or fails loudly (plaintext
//    bytes are not valid ciphertext — `hexToBytes` rejects non-hex content outright). Ordinary-first
//    would instead let `hasVerifier` stay false while some real entries are already ciphertext, which is
//    the exact "reads as unlocked, isn't" shape the original migration bug came from.
// disableDeviceLock never stages a verifier at all (see below), so the option does nothing for it.
async function promoteStaged(inner: KeyStore, order: 'ordinary-first' | 'verifier-first'): Promise<void> {
  const staging = stagingView(inner)
  const names = await staging.list()
  const ordinary = names.filter((name) => name !== SALT_ENTRY && name !== CHECK_ENTRY)
  const reserved = [SALT_ENTRY, CHECK_ENTRY].filter((name) => names.includes(name))

  const promote = async (name: string) => {
    const value = await staging.get(name)
    if (value != null) await inner.set(name, value)
  }
  const [first, second] = order === 'ordinary-first' ? [ordinary, reserved] : [reserved, ordinary]
  for (const name of first) await promote(name)
  for (const name of second) await promote(name)

  for (const name of names) await staging.delete(name)
}

// Discard whatever a PREVIOUS interrupted migration left in the staging area, before a new one starts
// writing there. Without this, an orphaned staged name from an abandoned attempt would still be sitting
// there the next time this device's lock changes and would get promoted alongside the new generation —
// a stale, unrelated entry landing in the real store as a side effect of an unrelated migration.
async function clearStaging(inner: KeyStore): Promise<void> {
  const staging = stagingView(inner)
  for (const name of await staging.list()) await staging.delete(name)
}

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

// Encrypt an until-now-plaintext store in place and return the locked view of it. Every new value is
// computed into a staging area first (see promoteStaged) — the real, currently-plaintext entries are
// never touched until the whole new generation exists and is ready to promote in one pass.
export async function enableDeviceLock(inner: KeyStore, code: string): Promise<KeyStore> {
  requireLongEnough(code)
  if (await hasVerifier(inner)) throw unlockFailed(undefined, 'This device is already locked.')

  await clearStaging(inner)
  const values = await readAll(inner)
  const staged = new EncryptedKeyStore(stagingView(inner), code)
  for (const [name, value] of values) await staged.set(name, value)
  await staged.writeVerifier()

  await promoteStaged(inner, 'verifier-first')
  return new EncryptedKeyStore(inner, code)
}

// Re-encrypt every value under a new code. The old real entries stay exactly as they are — readable
// under `currentCode` — until the new generation is fully staged and ready to promote; the old code
// only stops working once every value it could read has an already-verified replacement.
export async function changeUnlockCode(inner: KeyStore, currentCode: string, newCode: string): Promise<KeyStore> {
  requireLongEnough(newCode)

  const current = new EncryptedKeyStore(inner, currentCode)
  if (!(await current.verifyCode())) throw unlockFailed()

  await clearStaging(inner)
  const values = await readAll(current)
  const staged = new EncryptedKeyStore(stagingView(inner), newCode)
  for (const [name, value] of values) await staged.set(name, value)
  await staged.writeVerifier()

  await promoteStaged(inner, 'ordinary-first')
  return new EncryptedKeyStore(inner, newCode)
}

// Decrypt everything back to plaintext at rest and return the now-unlocked inner store. Plaintext is
// staged the same way ciphertext is above — nothing about the real, still-locked entries changes until
// every value has already been read back successfully — but the staged copies are plaintext, so this is
// the one path where the staging window itself briefly holds secrets unencrypted (under the reserved
// staging names, at rest, for the few `set` calls promoteStaged needs). enableDeviceLock/changeUnlockCode
// never do that; disabling the lock at all is the user asking for exactly this.
export async function disableDeviceLock(inner: KeyStore, code: string): Promise<KeyStore> {
  const store = new EncryptedKeyStore(inner, code)
  if (!(await store.verifyCode())) throw unlockFailed()

  await clearStaging(inner)
  const values = await readAll(store)
  const staging = stagingView(inner)
  for (const [name, value] of values) await staging.set(name, value)
  // The staged copy has no verifier of its own — plaintext has nothing to verify against — so promotion
  // here removes the real verifier/salt outright instead of promoting a staged one over them. Order
  // doesn't matter for this call: staged names are never SALT_ENTRY/CHECK_ENTRY for a disable.
  await promoteStaged(inner, 'ordinary-first')
  await inner.delete(SALT_ENTRY)
  await inner.delete(CHECK_ENTRY)
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
