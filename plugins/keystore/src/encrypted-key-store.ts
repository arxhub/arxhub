import { decrypt, deriveKeyFromPassphrase, encrypt, generateSalt } from '@arxhub/crypto'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import type { KeyStore } from './keystore'

// Reserved entry (in the inner store) holding the per-store scrypt salt as hex. Not secret; needed to
// re-derive the key on the next unlock. Hidden from list() so it never shows up as a user secret.
const SALT_ENTRY = '__vault_salt__'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// A KeyStore decorator that encrypts every value at rest with AES-256-GCM under a key derived from a
// user passphrase (scrypt). The inner store then holds only ciphertext + a non-secret salt — so a
// stolen localStorage dump (or an XSS read of it) yields nothing usable without the passphrase, which
// is never persisted. This is the browser hardening for the device mnemonic; on Tauri an OS keychain
// backend is the stronger option (no passphrase), but every platform can use this.
//
// The passphrase must be supplied at construction (from an unlock prompt at the composition root,
// before the identity is resolved). A wrong passphrase is not detectable up front — it surfaces as a
// decryption failure on the first get() of an existing value (the GCM auth tag fails to verify).
export class EncryptedKeyStore implements KeyStore {
  private readonly inner: KeyStore
  private readonly passphrase: string
  // Derived once (scrypt is deliberately slow) and cached for the store's lifetime.
  private keyPromise: Promise<Uint8Array> | null = null

  constructor(inner: KeyStore, passphrase: string) {
    this.inner = inner
    this.passphrase = passphrase
  }

  async get(name: string): Promise<string | null> {
    const stored = await this.inner.get(name)
    if (stored == null) return null
    // Throws (decryptionFailed) on a wrong passphrase or tampered ciphertext — never returns garbage.
    return decoder.decode(decrypt(await this.key(), hexToBytes(stored)))
  }

  async set(name: string, value: string): Promise<void> {
    const blob = encrypt(await this.key(), encoder.encode(value))
    await this.inner.set(name, bytesToHex(blob))
  }

  has(name: string): Promise<boolean> {
    return this.inner.has(name)
  }

  delete(name: string): Promise<void> {
    return this.inner.delete(name)
  }

  async list(): Promise<string[]> {
    return (await this.inner.list()).filter((name) => name !== SALT_ENTRY)
  }

  // Load-or-create the salt in the inner store, then derive the key. Cached so scrypt runs once.
  private key(): Promise<Uint8Array> {
    if (this.keyPromise == null) this.keyPromise = this.deriveKey()
    return this.keyPromise
  }

  private async deriveKey(): Promise<Uint8Array> {
    let saltHex = await this.inner.get(SALT_ENTRY)
    if (saltHex == null) {
      saltHex = bytesToHex(generateSalt())
      await this.inner.set(SALT_ENTRY, saltHex)
    }
    return deriveKeyFromPassphrase(this.passphrase, hexToBytes(saltHex))
  }
}
