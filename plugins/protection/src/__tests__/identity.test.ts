import { generateMnemonic, validateMnemonic } from '@arxhub/crypto'
import { hasErrorCode } from '@arxhub/errors'
import { MemoryKeyStore } from '@arxhub/plugin-keystore'
import { describe, expect, it } from 'vitest'
import { createIdentity, hasIdentity, IDENTITY_MNEMONIC_KEY, loadKeyring } from '../identity'

describe('loadKeyring', () => {
  it('refuses a store with no identity instead of minting one', async () => {
    const store = new MemoryKeyStore()

    const error = await loadKeyring(store).catch((e) => e)

    expect(hasErrorCode(error, 'IllegalStateError')).toBe(true)
    expect(await store.get(IDENTITY_MNEMONIC_KEY)).toBeNull()
  })

  it('reads an existing valid mnemonic without replacing it', async () => {
    const store = new MemoryKeyStore()
    const mnemonic = generateMnemonic()
    await store.set(IDENTITY_MNEMONIC_KEY, mnemonic)

    const keyring = await loadKeyring(store)

    expect(keyring).toBeDefined()
    expect(await store.get(IDENTITY_MNEMONIC_KEY)).toBe(mnemonic)
  })

  it('refuses to mint a replacement when the entry is present but not a valid mnemonic', async () => {
    const store = new MemoryKeyStore()
    // What a half-migrated device-lock leaves behind: raw ciphertext hex read through an unlocked
    // (verifier-less) store, not a mnemonic and not absent either.
    await store.set(IDENTITY_MNEMONIC_KEY, 'a1b2c3d4e5f6')

    const error = await loadKeyring(store).catch((e) => e)

    expect(hasErrorCode(error, 'CorruptIdentityError')).toBe(true)
    expect(await store.get(IDENTITY_MNEMONIC_KEY)).toBe('a1b2c3d4e5f6')
  })
})

describe('createIdentity', () => {
  it('writes a fresh valid mnemonic that loadKeyring then reads back', async () => {
    const store = new MemoryKeyStore()

    const mnemonic = await createIdentity(store)

    expect(validateMnemonic(mnemonic)).toBe(true)
    expect(await store.get(IDENTITY_MNEMONIC_KEY)).toBe(mnemonic)
    expect(await hasIdentity(store)).toBe(true)
    await expect(loadKeyring(store)).resolves.toBeDefined()
  })

  it('counts a corrupt entry as an identity, so nothing offers to create a vault over it', async () => {
    const store = new MemoryKeyStore()
    await store.set(IDENTITY_MNEMONIC_KEY, 'not a phrase')

    expect(await hasIdentity(store)).toBe(true)
  })
})
