import { describe, expect, it } from 'vitest'
import { keyringFromMnemonic } from '../keyring'
import { type RequestDescriptor, signRequest, verifyRequestSignature } from '../request-auth'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const OTHER = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

const client = keyringFromMnemonic(MNEMONIC)
const desc: RequestDescriptor = { method: 'PUT', path: '/vfs/write', query: 'path=note.md', body: new TextEncoder().encode('hi') }

describe('request-auth', () => {
  it('signs and verifies a request against the signing key', () => {
    const headers = signRequest(client, desc)
    expect(headers.publicKey).toBe(client.authPublicKey)
    expect(verifyRequestSignature(client.authPublicKey, desc, headers)).toBe(true)
  })

  it('is deterministic given fixed timestamp+nonce (canonical form is stable)', () => {
    const a = signRequest(client, desc, { timestamp: 1751500000, nonce: 'abcd' })
    const b = signRequest(client, desc, { timestamp: 1751500000, nonce: 'abcd' })
    expect(a.signature).toBe(b.signature)
  })

  it('rejects a tampered method', () => {
    const headers = signRequest(client, desc)
    expect(verifyRequestSignature(client.authPublicKey, { ...desc, method: 'DELETE' }, headers)).toBe(false)
  })

  it('rejects a tampered path', () => {
    const headers = signRequest(client, desc)
    expect(verifyRequestSignature(client.authPublicKey, { ...desc, path: '/vfs/read' }, headers)).toBe(false)
  })

  it('rejects a tampered query', () => {
    const headers = signRequest(client, desc)
    expect(verifyRequestSignature(client.authPublicKey, { ...desc, query: 'path=other.md' }, headers)).toBe(false)
  })

  it('rejects a tampered body', () => {
    const headers = signRequest(client, desc)
    expect(verifyRequestSignature(client.authPublicKey, { ...desc, body: new TextEncoder().encode('bye') }, headers)).toBe(false)
  })

  it('rejects a swapped timestamp or nonce (replay of the signed values)', () => {
    const headers = signRequest(client, desc, { timestamp: 1751500000, nonce: 'abcd' })
    expect(verifyRequestSignature(client.authPublicKey, desc, { ...headers, timestamp: '1751500001' })).toBe(false)
    expect(verifyRequestSignature(client.authPublicKey, desc, { ...headers, nonce: 'ef01' })).toBe(false)
  })

  it('rejects verification against a different public key', () => {
    const headers = signRequest(client, desc)
    expect(verifyRequestSignature(keyringFromMnemonic(OTHER).authPublicKey, desc, headers)).toBe(false)
  })

  it('returns false on malformed signature/timestamp instead of throwing', () => {
    const headers = signRequest(client, desc)
    expect(verifyRequestSignature(client.authPublicKey, desc, { ...headers, signature: 'zzzz' })).toBe(false)
    expect(verifyRequestSignature(client.authPublicKey, desc, { ...headers, timestamp: 'not-a-number' })).toBe(false)
  })

  it('handles a request with no body/query', () => {
    const bare: RequestDescriptor = { method: 'GET', path: '/vfs/list' }
    const headers = signRequest(client, bare)
    expect(verifyRequestSignature(client.authPublicKey, bare, headers)).toBe(true)
  })
})
