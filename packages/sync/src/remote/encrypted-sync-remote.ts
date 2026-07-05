import { decrypt, encrypt } from '@arxhub/crypto'
import type { SyncRemote } from './sync-remote'

// SyncRemote decorator: every object payload is AES-256-GCM encrypted before it leaves the device
// and decrypted on the way back, so the remote only ever holds ciphertext blobs. Object HASHES (the
// addresses) stay plaintext-derived — that is the accepted metadata trade-off already made for
// content-addressed storage (server gets a known-content confirmation oracle, nothing more), and it
// is what keeps dedup working. The engine verifies hashes AFTER decryption, so a swapped blob fails
// integrity checks locally. `key` must be 32 bytes (AES-256), from the keyring.
export class EncryptedSyncRemote implements SyncRemote {
  private readonly inner: SyncRemote
  private readonly key: Uint8Array

  constructor(inner: SyncRemote, key: Uint8Array) {
    this.inner = inner
    this.key = key
  }

  getHead(): Promise<string | null> {
    return this.inner.getHead()
  }

  setHead(expected: string | null, next: string): Promise<boolean> {
    return this.inner.setHead(expected, next)
  }

  hasObjects(hashes: string[]): Promise<Set<string>> {
    return this.inner.hasObjects(hashes)
  }

  async getObjects(hashes: string[]): Promise<Map<string, Uint8Array>> {
    const encrypted = await this.inner.getObjects(hashes)
    const objects = new Map<string, Uint8Array>()
    for (const [hash, bytes] of encrypted) {
      objects.set(hash, decrypt(this.key, bytes))
    }
    return objects
  }

  putObjects(objects: Map<string, Uint8Array>): Promise<void> {
    const encrypted = new Map<string, Uint8Array>()
    for (const [hash, bytes] of objects) {
      encrypted.set(hash, encrypt(this.key, bytes))
    }
    return this.inner.putObjects(encrypted)
  }
}
