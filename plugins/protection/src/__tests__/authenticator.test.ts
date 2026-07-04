import { keyringFromMnemonic, type RequestDescriptor, signRequest } from '@arxhub/crypto'
import { describe, expect, it } from 'vitest'
import { RequestAuthenticator } from '../authenticator'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const OTHER = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

const client = keyringFromMnemonic(MNEMONIC)
const attacker = keyringFromMnemonic(OTHER)
const NOW = 1751500000
const desc: RequestDescriptor = { method: 'PUT', path: '/vfs/write', query: 'path=note.md', body: new TextEncoder().encode('hi') }

// Sign at server-time so the freshness window passes; vary nonce per call.
function sign(keyring = client, nonce = 'n1', timestamp = NOW) {
  return signRequest(keyring, desc, { timestamp, nonce })
}

describe('RequestAuthenticator (TOFU)', () => {
  it('pins the first valid key and accepts it', () => {
    const auth = new RequestAuthenticator()
    const r = auth.authenticate(desc, sign(client, 'n1'), NOW)
    expect(r).toEqual({ ok: true, publicKey: client.authPublicKey, pairedNow: true })
    expect(auth.pinnedPublicKey).toBe(client.authPublicKey)
  })

  it('accepts subsequent requests from the pinned key (fresh nonce), not paired again', () => {
    const auth = new RequestAuthenticator()
    auth.authenticate(desc, sign(client, 'n1'), NOW)
    const r = auth.authenticate(desc, sign(client, 'n2'), NOW)
    expect(r).toEqual({ ok: true, publicKey: client.authPublicKey, pairedNow: false })
  })

  it('rejects a different key once pinned', () => {
    const auth = new RequestAuthenticator()
    auth.authenticate(desc, sign(client, 'n1'), NOW)
    expect(auth.authenticate(desc, sign(attacker, 'n2'), NOW)).toEqual({ ok: false, reason: 'unknown-key' })
  })

  it('rejects missing headers', () => {
    expect(new RequestAuthenticator().authenticate(desc, null, NOW)).toEqual({ ok: false, reason: 'missing' })
  })

  it('rejects a stale timestamp (outside the window)', () => {
    const auth = new RequestAuthenticator({ toleranceSeconds: 30 })
    expect(auth.authenticate(desc, sign(client, 'n1', NOW - 31), NOW)).toEqual({ ok: false, reason: 'stale' })
  })

  it('rejects a tampered request (signature no longer matches)', () => {
    const auth = new RequestAuthenticator()
    const headers = sign(client, 'n1')
    const tampered: RequestDescriptor = { ...desc, path: '/vfs/read' }
    expect(auth.authenticate(tampered, headers, NOW)).toEqual({ ok: false, reason: 'bad-signature' })
  })

  it('rejects a replayed nonce', () => {
    const auth = new RequestAuthenticator()
    const headers = sign(client, 'dup')
    expect(auth.authenticate(desc, headers, NOW).ok).toBe(true)
    expect(auth.authenticate(desc, headers, NOW)).toEqual({ ok: false, reason: 'replay' })
  })

  it('a previously-seen nonce is usable again after it expires from the window', () => {
    const auth = new RequestAuthenticator({ toleranceSeconds: 30 })
    auth.authenticate(desc, sign(client, 'dup', NOW), NOW)
    // Far in the future: the old nonce entry has expired and is pruned; a fresh signature reuses it.
    const later = NOW + 1000
    expect(auth.authenticate(desc, sign(client, 'dup', later), later).ok).toBe(true)
  })

  it('keeps a replayed nonce blocked for the full window even when the client clock runs ahead', () => {
    const auth = new RequestAuthenticator({ toleranceSeconds: 30 })
    // Client clock 20s ahead of the server: it signs at NOW+20, the server receives it at NOW.
    const headers = sign(client, 'skew', NOW + 20)
    expect(auth.authenticate(desc, headers, NOW).ok).toBe(true)
    // A replay lands at server-time NOW+35. The signed timestamp NOW+20 is still fresh
    // (|(NOW+35)-(NOW+20)| = 15 <= 30), so the nonce must still be cached. Anchoring nonce expiry to
    // the signed timestamp (NOW+20+30 = NOW+50) keeps it blocked; anchoring to the server clock
    // (NOW+30) would prune it at NOW+31 and let this replay through — a hole equal to the skew.
    expect(auth.authenticate(desc, headers, NOW + 35)).toEqual({ ok: false, reason: 'replay' })
  })
})

describe('RequestAuthenticator (onPair persistence hook)', () => {
  it('invokes onPair once when a key is pinned via TOFU, not on later requests', () => {
    const paired: string[] = []
    const auth = new RequestAuthenticator({ onPair: (k) => paired.push(k) })
    auth.authenticate(desc, sign(client, 'n1'), NOW)
    auth.authenticate(desc, sign(client, 'n2'), NOW)
    expect(paired).toEqual([client.authPublicKey])
  })

  it('does not invoke onPair when a key is pre-configured (TOFU disabled)', () => {
    const paired: string[] = []
    const auth = new RequestAuthenticator({ pinnedPublicKey: client.authPublicKey, onPair: (k) => paired.push(k) })
    auth.authenticate(desc, sign(client, 'n1'), NOW)
    expect(paired).toEqual([])
  })
})

describe('RequestAuthenticator (configured pin, TOFU disabled)', () => {
  it('accepts only the configured key', () => {
    const auth = new RequestAuthenticator({ pinnedPublicKey: client.authPublicKey })
    expect(auth.authenticate(desc, sign(client, 'n1'), NOW)).toEqual({ ok: true, publicKey: client.authPublicKey, pairedNow: false })
    expect(auth.authenticate(desc, sign(attacker, 'n2'), NOW)).toEqual({ ok: false, reason: 'unknown-key' })
  })
})
