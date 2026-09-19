import { generateMnemonic, type Keyring, keyringFromMnemonic, validateMnemonic } from '@arxhub/crypto'
import { AppError, defineAppError } from '@arxhub/errors'
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

// Resolve the device keyring from the KeyStore, generating a fresh mnemonic only when none exists yet.
// Call this in an instance's main.ts BEFORE building the HTTP VFS / starting ArxHub, so every /vfs
// request is signed from the very first one. The mnemonic lives only in the client-local KeyStore —
// never the server VFS.
//
// A missing entry (`null`) is the only case that mints a new identity. A *present* entry that fails
// validation is a corrupt-store condition, not an absent one, and must fail loudly (see corruptIdentity
// above) — the two used to be handled the same way, which is how a botched device-lock migration turned
// into a brand new, silently-generated identity.
export async function loadOrCreateKeyring(keystore: KeyStore): Promise<Keyring> {
  const stored = await keystore.get(IDENTITY_MNEMONIC_KEY)
  if (stored == null) {
    const mnemonic = generateMnemonic()
    await keystore.set(IDENTITY_MNEMONIC_KEY, mnemonic)
    return keyringFromMnemonic(mnemonic)
  }

  const existing = stored.trim()
  if (!validateMnemonic(existing)) throw corruptIdentity()
  return keyringFromMnemonic(existing)
}
