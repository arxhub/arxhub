import { describe, expect, it } from 'vitest'
import { EncryptedKeyStore } from '../encrypted-key-store'
import { MemoryKeyStore } from '../keystore'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const PASS = 'correct horse battery staple'

describe('EncryptedKeyStore', () => {
  it('round-trips a value', async () => {
    const store = new EncryptedKeyStore(new MemoryKeyStore(), PASS)
    await store.set('identity.mnemonic', MNEMONIC)
    expect(await store.get('identity.mnemonic')).toBe(MNEMONIC)
  })

  it('stores only ciphertext in the inner store (no plaintext at rest)', async () => {
    const inner = new MemoryKeyStore()
    await new EncryptedKeyStore(inner, PASS).set('identity.mnemonic', MNEMONIC)

    const stored = await inner.get('identity.mnemonic')
    expect(stored).not.toBeNull()
    expect(stored).not.toContain('abandon')
    expect(stored).not.toBe(MNEMONIC)
    // Hex ciphertext: iv (12B) + ciphertext + tag (16B) → well over the plaintext, all hex chars.
    expect(stored).toMatch(/^[0-9a-f]+$/)
  })

  it('reads back across a fresh instance with the same passphrase (salt is persisted + reused)', async () => {
    const inner = new MemoryKeyStore()
    await new EncryptedKeyStore(inner, PASS).set('identity.mnemonic', MNEMONIC)

    // A new store over the same inner + same passphrase must decrypt — proving the salt round-tripped.
    const reopened = new EncryptedKeyStore(inner, PASS)
    expect(await reopened.get('identity.mnemonic')).toBe(MNEMONIC)
  })

  it('rejects a get() under the wrong passphrase (auth tag fails, no garbage returned)', async () => {
    const inner = new MemoryKeyStore()
    await new EncryptedKeyStore(inner, PASS).set('identity.mnemonic', MNEMONIC)

    const wrong = new EncryptedKeyStore(inner, 'not the passphrase')
    await expect(wrong.get('identity.mnemonic')).rejects.toThrow()
  })

  it('hides the internal salt entry from list()', async () => {
    const store = new EncryptedKeyStore(new MemoryKeyStore(), PASS)
    await store.set('identity.mnemonic', MNEMONIC)
    await store.set('server.token', 'abc')

    const names = await store.list()
    expect(names.sort()).toEqual(['identity.mnemonic', 'server.token'])
    expect(names).not.toContain('__vault_salt__')
  })

  it('delegates has() and delete()', async () => {
    const store = new EncryptedKeyStore(new MemoryKeyStore(), PASS)
    await store.set('k', 'v')
    expect(await store.has('k')).toBe(true)
    await store.delete('k')
    expect(await store.has('k')).toBe(false)
    expect(await store.get('k')).toBeNull()
  })

  it('returns null for an absent key', async () => {
    const store = new EncryptedKeyStore(new MemoryKeyStore(), PASS)
    expect(await store.get('nope')).toBeNull()
  })
})
