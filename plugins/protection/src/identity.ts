import { generateMnemonic, type Keyring, keyringFromMnemonic, validateMnemonic } from '@arxhub/crypto'
import { AppError, defineAppError, illegalState } from '@arxhub/errors'
import type { KeyStore } from '@arxhub/plugin-keystore'
import type { Static } from '@sinclair/typebox'

// KeyStore entry name for the device's root secret.
export const IDENTITY_MNEMONIC_KEY = 'identity.mnemonic'

// Raised when the KeyStore holds *something* under the identity entry but it isn't a valid mnemonic —
// e.g. leftover ciphertext from an interrupted device-lock migration, surfaced as raw hex because the
// store was reading as unlocked. Minting a replacement here (as the code used to) would silently and
// permanently orphan every synced snapshot encrypted under the real identity; there is no content to
// lose by refusing instead, only a boot to fix.
export const corruptIdentitySchema = defineAppError('CorruptIdentityError', 500)

export const corruptIdentity = () =>
  new AppError<Static<typeof corruptIdentitySchema>>({
    code: 'CorruptIdentityError',
    statusCode: 500,
    title: 'Device identity unreadable',
    message:
      `The value stored under "${IDENTITY_MNEMONIC_KEY}" is not a valid recovery phrase. This usually means an ` +
      'interrupted device-lock change left the key store half-migrated. Restoring the phrase from a backup, or ' +
      "resetting this device's lock in Security settings, will fix it — generating a replacement here would " +
      'silently and permanently cut this device off from its synced history.',
  })

// Resolve the device keyring from the KeyStore. Call this in an instance's main.ts BEFORE building the
// HTTP VFS / starting ArxHub, so every /vfs request is signed from the very first one. The mnemonic lives
// only in the client-local KeyStore — never the server VFS.
//
// It never mints one. An identity is either made on purpose (the first run's "Create a new vault") or
// brought from another device, and the entry flow has settled which before the boot gets here — a
// missing entry at this point is a boot that skipped it. A *present* entry that fails validation is a
// corrupt-store condition (see corruptIdentity above); minting a replacement for either is how a botched
// device-lock migration once turned into a brand new, silently-generated identity.
export async function loadKeyring(keystore: KeyStore): Promise<Keyring> {
  const stored = await keystore.get(IDENTITY_MNEMONIC_KEY)
  if (stored == null) throw illegalState('This device has no identity yet — the first-run entry flow must run before the boot')

  const existing = stored.trim()
  if (!validateMnemonic(existing)) throw corruptIdentity()
  return keyringFromMnemonic(existing)
}

// Whether the store holds anything under the identity entry. A corrupt value counts: it is loadKeyring's
// to refuse, and the entry flow must not offer to create a vault over it.
export async function hasIdentity(keystore: KeyStore): Promise<boolean> {
  return (await keystore.get(IDENTITY_MNEMONIC_KEY)) != null
}

// A new vault's root secret, written through whatever store it is handed — on the first run that is the
// already-locked view, so the phrase is never at rest in the clear.
export async function createIdentity(keystore: KeyStore): Promise<string> {
  const mnemonic = generateMnemonic()
  await keystore.set(IDENTITY_MNEMONIC_KEY, mnemonic)
  return mnemonic
}

// A phrase brought from another device — typed, or handed over by pairing — becoming this device's
// identity. Checked once more here, because a phrase that does not validate would be refused by
// loadKeyring at the next boot, after the entry flow had already said it worked.
export async function storeIdentity(keystore: KeyStore, mnemonic: string): Promise<void> {
  const phrase = mnemonic.trim().split(/\s+/).join(' ')
  if (!validateMnemonic(phrase)) throw corruptIdentity()
  await keystore.set(IDENTITY_MNEMONIC_KEY, phrase)
}
