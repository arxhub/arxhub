import { describe, expect, it } from 'vitest'
import { decrypt, encrypt } from '../cipher'
import { deriveKeyFromPassphrase, generateSalt } from '../kdf'

describe('passphrase KDF', () => {
  it('derives a 32-byte AES-256 key', () => {
    const key = deriveKeyFromPassphrase('correct horse battery staple', generateSalt())
    expect(key.length).toBe(32)
  })

  it('is deterministic for the same passphrase + salt', () => {
    const salt = generateSalt()
    const a = deriveKeyFromPassphrase('hunter2', salt)
    const b = deriveKeyFromPassphrase('hunter2', salt)
    expect(a).toEqual(b)
  })

  it('a different passphrase yields a different key (same salt)', () => {
    const salt = generateSalt()
    expect(deriveKeyFromPassphrase('hunter2', salt)).not.toEqual(deriveKeyFromPassphrase('hunter3', salt))
  })

  it('a different salt yields a different key (same passphrase)', () => {
    expect(deriveKeyFromPassphrase('hunter2', generateSalt())).not.toEqual(deriveKeyFromPassphrase('hunter2', generateSalt()))
  })

  it('produces a usable cipher key: encrypt then decrypt round-trips', () => {
    const key = deriveKeyFromPassphrase('open sesame', generateSalt())
    const plaintext = new TextEncoder().encode('the twelve words')
    expect(decrypt(key, encrypt(key, plaintext))).toEqual(plaintext)
  })

  it('generates a fresh salt each call', () => {
    expect(generateSalt()).not.toEqual(generateSalt())
  })
})
