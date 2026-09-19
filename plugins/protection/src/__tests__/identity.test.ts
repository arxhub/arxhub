import { generateMnemonic, validateMnemonic } from '@arxhub/crypto'
import { hasErrorCode } from '@arxhub/errors'
import { MemoryKeyStore } from '@arxhub/plugin-keystore'
import { describe, expect, it } from 'vitest'
import { IDENTITY_MNEMONIC_KEY, loadOrCreateKeyring } from '../identity'

describe('loadOrCreateKeyring', () => {
  it('mints and persists a new mnemonic when the entry is absent', async () => {
    const store = new MemoryKeyStore()

    const keyring = await loadOrCreateKeyring(store)

    const stored = await store.get(IDENTITY_MNEMONIC_KEY)
    expect(stored).not.toBeNull()
    expect(validateMnemonic(stored ?? '')).toBe(true)
    expect(keyring).toBeDefined()
  })

  it('reuses an existing valid mnemonic rather than replacing it', async () => {
    const store = new MemoryKeyStore()
    const mnemonic = generateMnemonic()
    await store.set(IDENTITY_MNEMONIC_KEY, mnemonic)

    await loadOrCreateKeyring(store)

    expect(await store.get(IDENTITY_MNEMONIC_KEY)).toBe(mnemonic)
  })

  it('refuses to mint a replacement when the entry is present but not a valid mnemonic', async () => {
    const store = new MemoryKeyStore()
    // What a half-migrated device-lock leaves behind: raw ciphertext hex read through an unlocked
    // (verifier-less) store, not a mnemonic and not absent either.
    await store.set(IDENTITY_MNEMONIC_KEY, 'a1b2c3d4e5f6')

    const error = await loadOrCreateKeyring(store).catch((e) => e)

    expect(hasErrorCode(error, 'CorruptIdentityError')).toBe(true)
    // Must not have overwritten the corrupt value with a fresh mnemonic on the way out.
    expect(await store.get(IDENTITY_MNEMONIC_KEY)).toBe('a1b2c3d4e5f6')
  })
})
