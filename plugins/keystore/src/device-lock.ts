import {
  CHECK_ENTRY,
  CODE_SHAPE_DIGITS_6,
  CODE_SHAPE_ENTRY,
  EncryptedKeyStore,
  hasVerifier,
  isReservedEntry,
  SALT_ENTRY,
} from './encrypted-key-store'
import { unlockCodeLength, unlockCodeNotNumeric, unlockFailed } from './errors'
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
  const ordinary = names.filter((name) => !isReservedEntry(name))
  // The shape marker goes after the verifier in both directions: a marker ahead of its verifier would
  // make the screen submit an older, longer code at its sixth digit, and that device could then never
  // be opened. A verifier ahead of its marker only costs the confirm key until the next unlock.
  const reserved = [SALT_ENTRY, CHECK_ENTRY, CODE_SHAPE_ENTRY].filter((name) => names.includes(name))

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

// Exactly six, the owner's decision (12-keystore, 2026-09-26): with one length for everyone the screen
// can submit on the sixth digit, and the length never has to sit in the clear beside the ciphertext.
// A six-digit code costs an attacker who already holds a copy of the storage ~36 core-hours at the KDF's
// parameters (see the scrypt note in @arxhub/crypto kdf) — enough to deter someone who stumbles onto a
// synced browser profile, not someone who came for this vault.
export const UNLOCK_CODE_LENGTH = 6

// Digits only, because the keypad is the only input the code is ever entered on — on a phone there is
// no other one. A stored code carrying anything else could never be typed back in, so accepting one
// would be locking the device against its owner.
const DIGITS_ONLY = /^\d+$/

// What a screen asks before it offers to set a code. It is not the enforcement — enableDeviceLock and
// changeUnlockCode refuse on their own, so a caller that never renders anything cannot get past it.
export function isUnlockCodeValid(code: string): boolean {
  return code.length === UNLOCK_CODE_LENGTH && DIGITS_ONLY.test(code)
}

// How the unlock screen takes a code. 'digits-6' submits itself on the sixth digit; 'legacy' is a lock
// set under the old "six or more" rule, whose length nothing records — auto-submitting there would
// count every longer code as a wrong attempt and start the backoff, so it keeps a confirm key.
export type CodeShape = 'digits-6' | 'legacy'

export async function getCodeShape(inner: KeyStore): Promise<CodeShape> {
  if (!(await hasVerifier(inner))) return 'digits-6'
  return (await inner.get(CODE_SHAPE_ENTRY)) === CODE_SHAPE_DIGITS_6 ? 'digits-6' : 'legacy'
}

// Whether this store is locked, i.e. its values are ciphertext and a code is needed to read them.
export function isDeviceLocked(inner: KeyStore): Promise<boolean> {
  return hasVerifier(inner)
}

// Open a locked store. Rejects with unlockFailed on a wrong code — never returns a store that cannot
// actually decrypt, so callers can boot on the result without a second failure mode later.
//
// A legacy lock opened with a code that already follows the rule is marked here, silently, so the next
// unlock submits on the sixth digit. Only a code that just opened the store is ever recorded — the
// marker must never claim a shape its verifier does not have.
export async function unlockDeviceKeyStore(inner: KeyStore, code: string): Promise<KeyStore> {
  const store = new EncryptedKeyStore(inner, code)
  if (!(await store.verifyCode())) throw unlockFailed()
  if (isUnlockCodeValid(code) && (await getCodeShape(inner)) === 'legacy') await inner.set(CODE_SHAPE_ENTRY, CODE_SHAPE_DIGITS_6)
  return store
}

// Whether `code` opens this device, without keeping the opened view. Settings asks for the code again
// before it hands out the vault key, and the answer is all it needs.
export async function verifyUnlockCode(inner: KeyStore, code: string): Promise<boolean> {
  return new EncryptedKeyStore(inner, code).verifyCode()
}

// Encrypt an until-now-plaintext store in place and return the locked view of it. Every new value is
// computed into a staging area first (see promoteStaged) — the real, currently-plaintext entries are
// never touched until the whole new generation exists and is ready to promote in one pass.
export async function enableDeviceLock(inner: KeyStore, code: string): Promise<KeyStore> {
  requireValidCode(code)
  if (await hasVerifier(inner)) throw unlockFailed(undefined, 'This device is already locked.')

  await clearStaging(inner)
  // A stray marker left in a plaintext store is not a secret to carry over: encrypted, it would read as
  // "no marker" and the fresh six-digit lock would come up as legacy.
  const values = (await readAll(inner)).filter(([name]) => !isReservedEntry(name))
  const staged = new EncryptedKeyStore(stagingView(inner), code)
  for (const [name, value] of values) await staged.set(name, value)
  await staged.writeVerifier()
  await stagingView(inner).set(CODE_SHAPE_ENTRY, CODE_SHAPE_DIGITS_6)

  await promoteStaged(inner, 'verifier-first')
  return new EncryptedKeyStore(inner, code)
}

// Re-encrypt every value under a new code. The old real entries stay exactly as they are — readable
// under `currentCode` — until the new generation is fully staged and ready to promote; the old code
// only stops working once every value it could read has an already-verified replacement.
export async function changeUnlockCode(inner: KeyStore, currentCode: string, newCode: string): Promise<KeyStore> {
  requireValidCode(newCode)

  const current = new EncryptedKeyStore(inner, currentCode)
  if (!(await current.verifyCode())) throw unlockFailed()

  await clearStaging(inner)
  const values = await readAll(current)
  const staged = new EncryptedKeyStore(stagingView(inner), newCode)
  for (const [name, value] of values) await staged.set(name, value)
  await staged.writeVerifier()
  await stagingView(inner).set(CODE_SHAPE_ENTRY, CODE_SHAPE_DIGITS_6)

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
  // The marker goes first: a lock interrupted here, still holding its verifier, then only comes up
  // with the confirm key rather than as a six-digit lock it may no longer be.
  await inner.delete(CODE_SHAPE_ENTRY)
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

// Only a code being SET goes through here. Unlocking and disabling take whatever the device was
// locked with and answer unlockFailed on a mismatch: a device locked before the keypad existed still
// has to report a wrong code as a wrong code, not as a rule it was never given a chance to follow.
function requireValidCode(code: string): void {
  if (!/^\d*$/.test(code)) throw unlockCodeNotNumeric()
  if (code.length !== UNLOCK_CODE_LENGTH) throw unlockCodeLength(UNLOCK_CODE_LENGTH)
}
