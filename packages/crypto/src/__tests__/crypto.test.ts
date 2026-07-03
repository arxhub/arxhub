import { hasErrorCode } from '@arxhub/errors'
import { describe, expect, it } from 'vitest'
import { verifyAuth } from '../auth'
import { decrypt, encrypt } from '../cipher'
import { keyringFromMnemonic } from '../keyring'
import { generateMnemonic, mnemonicToSeed, validateMnemonic } from '../mnemonic'

// A fixed valid BIP39 mnemonic (the canonical all-"abandon" test vector) so derivations are stable.
const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const OTHER = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

describe('mnemonic', () => {
  it('generates a valid 12-word mnemonic by default', () => {
    const m = generateMnemonic()
    expect(m.split(' ')).toHaveLength(12)
    expect(validateMnemonic(m)).toBe(true)
  })

  it('generates a 24-word mnemonic at 256-bit strength', () => {
    expect(generateMnemonic(256).split(' ')).toHaveLength(24)
  })

  it('rejects a mnemonic with a broken checksum', () => {
    expect(validateMnemonic('abandon abandon abandon')).toBe(false)
    expect(validateMnemonic(MNEMONIC.replace('about', 'abandon'))).toBe(false)
  })

  it('derives the same seed deterministically', () => {
    expect(mnemonicToSeed(MNEMONIC)).toEqual(mnemonicToSeed(MNEMONIC))
    expect(mnemonicToSeed(MNEMONIC)).not.toEqual(mnemonicToSeed(OTHER))
  })
})

describe('keyring', () => {
  it('derives a 32-byte AES key and an xpub deterministically from a mnemonic', () => {
    const a = keyringFromMnemonic(MNEMONIC)
    const b = keyringFromMnemonic(MNEMONIC)
    expect(a.encryptionKey).toHaveLength(32)
    expect(a.encryptionKey).toEqual(b.encryptionKey)
    expect(a.authPublicKey).toBe(b.authPublicKey)
    expect(a.authPublicKey.startsWith('xpub')).toBe(true)
  })

  it('derives different keys for different mnemonics', () => {
    const a = keyringFromMnemonic(MNEMONIC)
    const b = keyringFromMnemonic(OTHER)
    expect(a.encryptionKey).not.toEqual(b.encryptionKey)
    expect(a.authPublicKey).not.toBe(b.authPublicKey)
  })
})

describe('cipher (AES-256-GCM)', () => {
  const key = keyringFromMnemonic(MNEMONIC).encryptionKey
  const plaintext = new TextEncoder().encode('the tool recedes, content leads')

  it('round-trips plaintext', () => {
    const blob = encrypt(key, plaintext)
    expect(decrypt(key, blob)).toEqual(plaintext)
  })

  it('produces distinct ciphertext for identical plaintext (random IV)', () => {
    expect(encrypt(key, plaintext)).not.toEqual(encrypt(key, plaintext))
  })

  it('does not leak plaintext into the ciphertext blob', () => {
    const blob = encrypt(key, plaintext)
    expect(new TextDecoder().decode(blob)).not.toContain('content leads')
  })

  it('fails with the wrong key', () => {
    const blob = encrypt(key, plaintext)
    const wrong = keyringFromMnemonic(OTHER).encryptionKey
    try {
      decrypt(wrong, blob)
      expect.unreachable('decrypt should have thrown')
    } catch (error) {
      expect(hasErrorCode(error, 'DecryptionError')).toBe(true)
    }
  })

  it('fails on tampered ciphertext', () => {
    const blob = encrypt(key, plaintext)
    blob[blob.length - 1] ^= 0xff
    expect(() => decrypt(key, blob)).toThrow()
  })
})

describe('auth (signed challenge)', () => {
  const client = keyringFromMnemonic(MNEMONIC)
  const challenge = new TextEncoder().encode('nonce:12345:1751500000')

  it('verifies a signature against the paired public key', () => {
    const sig = client.sign(challenge)
    expect(verifyAuth(client.authPublicKey, challenge, sig)).toBe(true)
  })

  it('rejects a signature over a different message (replay/forgery guard)', () => {
    const sig = client.sign(challenge)
    const tampered = new TextEncoder().encode('nonce:99999:1751500000')
    expect(verifyAuth(client.authPublicKey, tampered, sig)).toBe(false)
  })

  it('rejects a valid signature checked against the wrong public key', () => {
    const sig = client.sign(challenge)
    const attacker = keyringFromMnemonic(OTHER)
    expect(verifyAuth(attacker.authPublicKey, challenge, sig)).toBe(false)
  })

  it('returns false (not throw) on a malformed public key', () => {
    const sig = client.sign(challenge)
    expect(verifyAuth('not-an-xpub', challenge, sig)).toBe(false)
  })
})
