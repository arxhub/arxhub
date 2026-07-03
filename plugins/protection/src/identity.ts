import { generateMnemonic, type Keyring, keyringFromMnemonic, validateMnemonic } from '@arxhub/crypto'
import type { KeyStore } from '@arxhub/plugin-keystore/ui'

// KeyStore entry name for the device's root secret.
export const IDENTITY_MNEMONIC_KEY = 'identity.mnemonic'

// Resolve the device keyring from the KeyStore, generating and persisting a fresh mnemonic on first
// run (or if the stored value is missing/corrupt). Call this in an instance's main.ts BEFORE building
// the HTTP VFS / starting ArxHub, so every /vfs request is signed from the very first one. The
// mnemonic lives only in the client-local KeyStore — never the server VFS.
export async function loadOrCreateKeyring(keystore: KeyStore): Promise<Keyring> {
  const existing = (await keystore.get(IDENTITY_MNEMONIC_KEY))?.trim()
  if (existing && validateMnemonic(existing)) return keyringFromMnemonic(existing)
  const mnemonic = generateMnemonic()
  await keystore.set(IDENTITY_MNEMONIC_KEY, mnemonic)
  return keyringFromMnemonic(mnemonic)
}
