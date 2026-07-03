import { generateMnemonic, type Keyring, keyringFromMnemonic, validateMnemonic } from '@arxhub/crypto'

// Where the device's mnemonic is persisted. It MUST be client-local (never the server VFS): the
// mnemonic is the root secret, and the sync server is zero-knowledge. It is also the auth credential,
// so it must be readable before any /vfs request is signed — reading it over /vfs would deadlock.
export interface IdentityStore {
  get(): string | null
  set(mnemonic: string): void
}

const STORAGE_KEY = 'arxhub.identity.mnemonic'

// Default browser/Tauri-webview store backed by localStorage. Synchronous, so the keyring can be
// resolved at the composition root before ArxHub.start().
export const browserIdentityStore: IdentityStore = {
  get: () => globalThis.localStorage?.getItem(STORAGE_KEY) ?? null,
  set: (mnemonic) => globalThis.localStorage?.setItem(STORAGE_KEY, mnemonic),
}

// Resolve the device keyring, generating and persisting a fresh mnemonic on first run (or if the
// stored value is corrupt). Call this in an instance's main.ts BEFORE building the HTTP VFS / starting
// ArxHub, so every /vfs request is signed from the very first one.
export function loadOrCreateKeyring(store: IdentityStore = browserIdentityStore): Keyring {
  const existing = store.get()?.trim()
  if (existing && validateMnemonic(existing)) return keyringFromMnemonic(existing)
  const mnemonic = generateMnemonic()
  store.set(mnemonic)
  return keyringFromMnemonic(mnemonic)
}
