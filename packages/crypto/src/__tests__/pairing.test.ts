import { hasErrorCode } from '@arxhub/errors'
import { describe, expect, it } from 'vitest'
import {
  derivePairingKey,
  derivePairingSas,
  formatPairingSas,
  generatePairingKeyPair,
  openPairingPayload,
  pairingCommit,
  pairingCommitMatches,
  sealPairingPayload,
} from '../pairing'
import {
  formatInvitationCode,
  fromB64Url,
  generateInvitationCode,
  generateInvitationId,
  generatePairingNonce,
  invitationQr,
  normalizeInvitationCode,
  parseInvitationQr,
  toB64Url,
} from '../pairing-code'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

function exchange() {
  const id = generateInvitationId()
  const host = generatePairingKeyPair()
  const joiner = generatePairingKeyPair()
  const hostNonce = generatePairingNonce()
  const joinerNonce = generatePairingNonce()
  return { id, host, joiner, hostNonce, joinerNonce }
}

describe('pairing key agreement', () => {
  it('derives the same SAS and key on both sides', () => {
    const { id, host, joiner, hostNonce, joinerNonce } = exchange()
    const sasInput = { id, hostKey: host.publicKey, joinerKey: joiner.publicKey, hostNonce, joinerNonce }
    const sas = derivePairingSas(sasInput)
    expect(sas).toMatch(/^\d{6}$/)
    expect(derivePairingSas({ ...sasInput })).toBe(sas)

    const onHost = derivePairingKey({
      id,
      ownSecretKey: host.secretKey,
      peerPublicKey: joiner.publicKey,
      hostKey: host.publicKey,
      joinerKey: joiner.publicKey,
    })
    const onJoiner = derivePairingKey({
      id,
      ownSecretKey: joiner.secretKey,
      peerPublicKey: host.publicKey,
      hostKey: host.publicKey,
      joinerKey: joiner.publicKey,
    })
    expect(onHost).toEqual(onJoiner)
    expect(onHost).toHaveLength(32)
  })

  it('a key swapped by the relay changes what each side shows', () => {
    const { id, host, joiner, hostNonce, joinerNonce } = exchange()
    const relay = generatePairingKeyPair()
    // The host sees the relay's key as the joiner's; the joiner sees the relay's key as the host's.
    const onHost = derivePairingSas({ id, hostKey: host.publicKey, joinerKey: relay.publicKey, hostNonce, joinerNonce })
    const onJoiner = derivePairingSas({ id, hostKey: relay.publicKey, joinerKey: joiner.publicKey, hostNonce, joinerNonce })
    const honest = derivePairingSas({ id, hostKey: host.publicKey, joinerKey: joiner.publicKey, hostNonce, joinerNonce })
    expect(onHost).not.toBe(honest)
    expect(onJoiner).not.toBe(honest)
    expect(onHost).not.toBe(onJoiner)
  })

  it('binds the SAS to the invitation and to both nonces', () => {
    const { id, host, joiner, hostNonce, joinerNonce } = exchange()
    const base = { id, hostKey: host.publicKey, joinerKey: joiner.publicKey, hostNonce, joinerNonce }
    const sas = derivePairingSas(base)
    expect(derivePairingSas({ ...base, id: generateInvitationId() })).not.toBe(sas)
    expect(derivePairingSas({ ...base, hostNonce: generatePairingNonce() })).not.toBe(sas)
    expect(derivePairingSas({ ...base, joinerNonce: generatePairingNonce() })).not.toBe(sas)
  })

  it('refuses a low-order peer key instead of agreeing on a zero secret', () => {
    const { id, host, joiner } = exchange()
    const zeroPoint = new Uint8Array(32)
    let error: unknown
    try {
      derivePairingKey({ id, ownSecretKey: host.secretKey, peerPublicKey: zeroPoint, hostKey: host.publicKey, joinerKey: joiner.publicKey })
    } catch (e) {
      error = e
    }
    expect(hasErrorCode(error, 'PairingKeyInvalidError')).toBe(true)
  })

  it('refuses a key of the wrong length', () => {
    const { id, host, joiner } = exchange()
    expect(() =>
      derivePairingKey({
        id,
        ownSecretKey: host.secretKey,
        peerPublicKey: new Uint8Array(31),
        hostKey: host.publicKey,
        joinerKey: joiner.publicKey,
      }),
    ).toThrow(/Peer key/)
  })

  it('formats the SAS in two groups', () => {
    expect(formatPairingSas('482915')).toBe('482 915')
  })
})

describe('pairing commit', () => {
  it('matches the revealed nonce and key it was made from', () => {
    const { joiner, joinerNonce } = exchange()
    const commit = pairingCommit(joinerNonce, joiner.publicKey)
    expect(pairingCommitMatches(commit, joinerNonce, joiner.publicKey)).toBe(true)
  })

  it('detects a nonce or key that differs from the commit', () => {
    const { joiner, joinerNonce } = exchange()
    const commit = pairingCommit(joinerNonce, joiner.publicKey)
    expect(pairingCommitMatches(commit, generatePairingNonce(), joiner.publicKey)).toBe(false)
    expect(pairingCommitMatches(commit, joinerNonce, generatePairingKeyPair().publicKey)).toBe(false)
    expect(pairingCommitMatches(commit.subarray(0, 31), joinerNonce, joiner.publicKey)).toBe(false)
  })
})

describe('pairing payload', () => {
  const key = () => {
    const { id, host, joiner } = exchange()
    return derivePairingKey({
      id,
      ownSecretKey: host.secretKey,
      peerPublicKey: joiner.publicKey,
      hostKey: host.publicKey,
      joinerKey: joiner.publicKey,
    })
  }

  it('round-trips', () => {
    const k = key()
    const payload = { v: 1 as const, mnemonic: MNEMONIC, serverUrl: 'https://hub.example.org' }
    expect(openPairingPayload(k, sealPairingPayload(k, payload))).toEqual(payload)
  })

  it('refuses a tampered blob', () => {
    const k = key()
    const blob = sealPairingPayload(k, { v: 1, mnemonic: MNEMONIC, serverUrl: 'https://hub.example.org' })
    blob[blob.length - 1] ^= 1
    let error: unknown
    try {
      openPairingPayload(k, blob)
    } catch (e) {
      error = e
    }
    expect(hasErrorCode(error, 'DecryptionError')).toBe(true)
  })

  it('refuses a blob sealed under another key', () => {
    const blob = sealPairingPayload(key(), { v: 1, mnemonic: MNEMONIC, serverUrl: '' })
    expect(() => openPairingPayload(key(), blob)).toThrow()
  })

  it('refuses an unknown version or a phrase that fails its checksum', () => {
    const k = key()
    const reject = (value: unknown) => {
      const blob = sealPairingPayload(k, value as never)
      let error: unknown
      try {
        openPairingPayload(k, blob)
      } catch (e) {
        error = e
      }
      return hasErrorCode(error, 'PairingPayloadInvalidError')
    }
    expect(reject({ v: 2, mnemonic: MNEMONIC, serverUrl: '' })).toBe(true)
    expect(reject({ v: 1, mnemonic: MNEMONIC.replace('about', 'abandon'), serverUrl: '' })).toBe(true)
    expect(reject({ v: 1, mnemonic: MNEMONIC })).toBe(true)
  })
})

describe('base64url', () => {
  it('round-trips without padding', () => {
    const bytes = new Uint8Array([0, 255, 62, 63, 1])
    const text = toB64Url(bytes)
    expect(text).not.toContain('=')
    expect(fromB64Url(text)).toEqual(bytes)
    expect(toB64Url(new Uint8Array(32))).toHaveLength(43)
    expect(toB64Url(new Uint8Array(16))).toHaveLength(22)
  })

  it('refuses padding, the standard alphabet and non-canonical spellings', () => {
    expect(() => fromB64Url('AA==')).toThrow()
    expect(() => fromB64Url('+/')).toThrow()
    expect(() => fromB64Url('AB')).toThrow()
    expect(() => fromB64Url('A')).toThrow()
  })
})

describe('invitation code', () => {
  it('is 8 Crockford characters', () => {
    for (let i = 0; i < 50; i++) expect(generateInvitationCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/)
  })

  it('normalizes what a person types', () => {
    expect(normalizeInvitationCode('abcd-efgh')).toBe('ABCDEFGH')
    expect(normalizeInvitationCode(' 7k2m 9pqr ')).toBe('7K2M9PQR')
    expect(normalizeInvitationCode('O0IL-1234')).toBe('00111234')
    expect(formatInvitationCode('7K2M9PQR')).toBe('7K2M-9PQR')
  })

  it('refuses the wrong length or a character outside the alphabet', () => {
    expect(normalizeInvitationCode('ABCDEFG')).toBeNull()
    expect(normalizeInvitationCode('ABCDEFGHJ')).toBeNull()
    expect(normalizeInvitationCode('ABCDEFGU')).toBeNull()
    expect(normalizeInvitationCode('ABCD_EFG')).toBeNull()
  })
})

describe('invitation QR', () => {
  const id = generateInvitationId()

  it('round-trips a server and an id', () => {
    const qr = invitationQr('https://hub.example.org/', id)
    expect(qr).toBe(`arxhub://pair?v=1&server=${encodeURIComponent('https://hub.example.org')}&id=${id}`)
    expect(parseInvitationQr(qr)).toEqual({ server: 'https://hub.example.org', id })
    expect(parseInvitationQr(invitationQr('http://192.168.1.5:3000/arx', id))).toEqual({ server: 'http://192.168.1.5:3000/arx', id })
  })

  it('refuses another scheme, version, field or a malformed value', () => {
    const server = encodeURIComponent('https://hub.example.org')
    expect(parseInvitationQr(`https://pair?v=1&server=${server}&id=${id}`)).toBeNull()
    expect(parseInvitationQr(`arxhub://pair?v=2&server=${server}&id=${id}`)).toBeNull()
    expect(parseInvitationQr(`arxhub://pair?v=1&server=${server}&id=${id}&key=x`)).toBeNull()
    expect(parseInvitationQr(`arxhub://pair?v=1&v=1&id=${id}`)).toBeNull()
    expect(parseInvitationQr(`arxhub://pair?v=1&server=${server}&id=short`)).toBeNull()
    expect(parseInvitationQr(`arxhub://pair?v=1&server=${encodeURIComponent('ftp://hub')}&id=${id}`)).toBeNull()
    expect(parseInvitationQr(`arxhub://pair?v=1&server=${encodeURIComponent('https://hub.example.org/')}&id=${id}`)).toBeNull()
    expect(parseInvitationQr(`arxhub://pair?v=1&server=%E0%A4%A&id=${id}`)).toBeNull()
  })
})
