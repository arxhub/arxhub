import { generatePairingKeyPair, generatePairingNonce, pairingCommit, toB64Url } from '@arxhub/crypto'
import { hasErrorCode } from '@arxhub/errors'
import { describe, expect, it } from 'vitest'
import { retryAfterOf } from '../pairing/errors'
import { PairingRelay } from '../pairing/relay'
import { CLAIM_MISSES_PER_MINUTE, JOIN_BURST, JOIN_REQUESTS_PER_INVITATION, MAX_OPEN_INVITATIONS, PAIRING_TTL_MS } from '../pairing/wire'

function clock(start = 1_000_000) {
  const state = { now: start }
  return { now: () => state.now, advance: (ms: number) => (state.now += ms) }
}

function thrown(fn: () => unknown): unknown {
  try {
    fn()
  } catch (error) {
    return error
  }
  throw new Error('expected a throw')
}

const hostKey = () => toB64Url(generatePairingKeyPair().publicKey)

function claimBody(deviceName = 'Pixel 8') {
  const joinerKey = generatePairingKeyPair().publicKey
  const nonce = generatePairingNonce()
  return { joinerKey: toB64Url(joinerKey), commit: toB64Url(pairingCommit(nonce, joinerKey)), deviceName, nonce: toB64Url(nonce) }
}

function setup() {
  const time = clock()
  const relay = new PairingRelay({ now: time.now })
  return { time, relay }
}

describe('PairingRelay', () => {
  it('walks the whole sequence and wipes key material on completion', () => {
    const { relay } = setup()
    const key = hostKey()
    const created = relay.create(key)
    expect(created.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/)
    expect(created.ttlSeconds).toBe(300)
    expect(relay.hostView(created.id)).toEqual({ state: 'open', ttlSeconds: 300 })

    const { nonce, ...body } = claimBody()
    const claimed = relay.claim(created.id, body)
    expect(claimed).toMatchObject({ id: created.id, hostKey: key })
    expect(relay.hostView(created.id)).toMatchObject({
      state: 'claimed',
      joiner: { key: body.joinerKey, commit: body.commit, deviceName: 'Pixel 8' },
    })

    const hostNonce = toB64Url(generatePairingNonce())
    relay.hostNonce(created.id, hostNonce)
    expect(relay.joinerView(created.id, claimed.token)).toMatchObject({ state: 'nonced', hostNonce })

    relay.reveal(created.id, claimed.token, nonce)
    expect(relay.hostView(created.id)).toMatchObject({ state: 'revealed', joinerNonce: nonce })

    const ciphertext = toB64Url(new Uint8Array(200).fill(7))
    relay.deliver(created.id, ciphertext)
    expect(relay.joinerView(created.id, claimed.token)).toMatchObject({ state: 'delivered', ciphertext })

    relay.ack(created.id, claimed.token)
    expect(relay.hostView(created.id)).toEqual({ state: 'completed', ttlSeconds: 300 })
    expect(relay.joinerView(created.id, claimed.token)).toEqual({ state: 'completed', ttlSeconds: 300 })
    // The code no longer finds anything once the invitation is finished.
    expect(
      hasErrorCode(
        thrown(() => relay.claim(created.code, claimBody())),
        'PairingNotFoundError',
      ),
    ).toBe(true)
  })

  it('finds an invitation by its typed code, however it was spelled', () => {
    const { relay } = setup()
    const created = relay.create(hostKey())
    const typed = `${created.code.slice(0, 4).toLowerCase()}-${created.code.slice(4)}`
    expect(relay.claim(typed, claimBody()).id).toBe(created.id)
  })

  it('can be claimed only once', () => {
    const { relay } = setup()
    const created = relay.create(hostKey())
    relay.claim(created.id, claimBody())
    expect(
      hasErrorCode(
        thrown(() => relay.claim(created.id, claimBody())),
        'PairingClaimedError',
      ),
    ).toBe(true)
  })

  it('requires the claiming token for every later joiner step', () => {
    const { relay } = setup()
    const created = relay.create(hostKey())
    relay.claim(created.id, claimBody())
    expect(
      hasErrorCode(
        thrown(() => relay.joinerView(created.id, null)),
        'PairingForbiddenError',
      ),
    ).toBe(true)
    expect(
      hasErrorCode(
        thrown(() => relay.joinerView(created.id, 'x'.repeat(43))),
        'PairingForbiddenError',
      ),
    ).toBe(true)
    expect(
      hasErrorCode(
        thrown(() => relay.joinerCancel(created.id, null)),
        'PairingForbiddenError',
      ),
    ).toBe(true)
    expect(relay.hostView(created.id).state).toBe('claimed')
  })

  it('refuses a step out of order', () => {
    const { relay } = setup()
    const created = relay.create(hostKey())
    const nonce = toB64Url(generatePairingNonce())
    expect(
      hasErrorCode(
        thrown(() => relay.hostNonce(created.id, nonce)),
        'PairingStateError',
      ),
    ).toBe(true)
    const claimed = relay.claim(created.id, claimBody())
    expect(
      hasErrorCode(
        thrown(() => relay.reveal(created.id, claimed.token, nonce)),
        'PairingStateError',
      ),
    ).toBe(true)
    expect(
      hasErrorCode(
        thrown(() => relay.deliver(created.id, 'AAAA')),
        'PairingStateError',
      ),
    ).toBe(true)
    expect(
      hasErrorCode(
        thrown(() => relay.ack(created.id, claimed.token)),
        'PairingStateError',
      ),
    ).toBe(true)
  })

  it('answers an expired invitation exactly like one that never existed', () => {
    const { relay, time } = setup()
    const created = relay.create(hostKey())
    time.advance(PAIRING_TTL_MS - 1)
    expect(relay.hostView(created.id).ttlSeconds).toBe(1)
    time.advance(1)
    const expired = thrown(() => relay.hostView(created.id))
    const never = thrown(() => relay.hostView('A'.repeat(22)))
    expect(hasErrorCode(expired, 'PairingNotFoundError')).toBe(true)
    expect((expired as { body: unknown }).body).toEqual((never as { body: unknown }).body)
    expect(
      hasErrorCode(
        thrown(() => relay.claim(created.code, claimBody())),
        'PairingNotFoundError',
      ),
    ).toBe(true)
    expect(relay.size).toBe(0)
  })

  it('sweeps expired invitations, tombstones included', () => {
    const { relay, time } = setup()
    const a = relay.create(hostKey())
    relay.create(hostKey())
    relay.hostCancel(a.id)
    time.advance(PAIRING_TTL_MS)
    relay.sweep()
    expect(relay.size).toBe(0)
  })

  it('caps the number of open invitations, not the finished ones', () => {
    const { relay } = setup()
    const open = Array.from({ length: MAX_OPEN_INVITATIONS }, () => relay.create(hostKey()))
    expect(
      hasErrorCode(
        thrown(() => relay.create(hostKey())),
        'PairingLimitError',
      ),
    ).toBe(true)
    relay.hostCancel(open[0].id)
    expect(() => relay.create(hostKey())).not.toThrow()
  })

  it('rate-limits the joiner side of one invitation', () => {
    const { relay, time } = setup()
    const created = relay.create(hostKey())
    const claimed = relay.claim(created.id, claimBody())
    for (let i = 1; i < JOIN_BURST; i++) relay.joinerView(created.id, claimed.token)
    const limited = thrown(() => relay.joinerView(created.id, claimed.token))
    expect(hasErrorCode(limited, 'PairingRateLimitedError')).toBe(true)
    expect(retryAfterOf(limited)).toBe(1)
    // Wrong tokens spend the same budget, so guessing is no cheaper than asking.
    time.advance(250)
    expect(
      hasErrorCode(
        thrown(() => relay.joinerView(created.id, null)),
        'PairingForbiddenError',
      ),
    ).toBe(true)
    expect(
      hasErrorCode(
        thrown(() => relay.joinerView(created.id, claimed.token)),
        'PairingRateLimitedError',
      ),
    ).toBe(true)
    time.advance(1000)
    expect(relay.joinerView(created.id, claimed.token).state).toBe('claimed')
  })

  it('caps the joiner requests over an invitation’s whole life', () => {
    const { relay, time } = setup()
    const created = relay.create(hostKey())
    const claimed = relay.claim(created.id, claimBody())
    for (let i = 1; i < JOIN_REQUESTS_PER_INVITATION; i++) {
      time.advance(250)
      relay.joinerView(created.id, claimed.token)
    }
    time.advance(250)
    const limited = thrown(() => relay.joinerView(created.id, claimed.token))
    expect(hasErrorCode(limited, 'PairingRateLimitedError')).toBe(true)
    expect(retryAfterOf(limited)).toBeGreaterThanOrEqual(1)
  })

  it('holds a server-wide budget for claims that find nothing', () => {
    const { relay, time } = setup()
    const created = relay.create(hostKey())
    for (let i = 0; i < CLAIM_MISSES_PER_MINUTE; i++) {
      expect(
        hasErrorCode(
          thrown(() => relay.claim('ZZZZ-ZZZZ', claimBody())),
          'PairingNotFoundError',
        ),
      ).toBe(true)
    }
    const limited = thrown(() => relay.claim('ZZZZ-ZZZZ', claimBody()))
    expect(hasErrorCode(limited, 'PairingRateLimitedError')).toBe(true)
    expect(retryAfterOf(limited)).toBe(60)
    // A claim that finds its invitation is never held back by strangers' misses.
    expect(relay.claim(created.code, claimBody()).id).toBe(created.id)
    time.advance(60_000)
    expect(
      hasErrorCode(
        thrown(() => relay.claim('ZZZZ-ZZZZ', claimBody())),
        'PairingNotFoundError',
      ),
    ).toBe(true)
  })

  it('reports a cancel to the other side and keeps no keys after it', () => {
    const { relay } = setup()
    const created = relay.create(hostKey())
    const claimed = relay.claim(created.id, claimBody())
    relay.joinerCancel(created.id, claimed.token)
    expect(relay.hostView(created.id)).toEqual({ state: 'cancelled', ttlSeconds: 300 })
    // Ending twice is not an error: both screens close on their own.
    expect(() => relay.hostCancel(created.id)).not.toThrow()
    expect(relay.hostView(created.id).state).toBe('cancelled')
  })

  it('refuses malformed bytes and an oversized payload', () => {
    const { relay } = setup()
    expect(
      hasErrorCode(
        thrown(() => relay.create('A'.repeat(42))),
        'ValidationError',
      ),
    ).toBe(true)
    const created = relay.create(hostKey())
    const body = claimBody()
    const claimed = relay.claim(created.id, body)
    relay.hostNonce(created.id, toB64Url(generatePairingNonce()))
    relay.reveal(created.id, claimed.token, body.nonce)
    expect(
      hasErrorCode(
        thrown(() => relay.deliver(created.id, toB64Url(new Uint8Array(4097)))),
        'ValidationError',
      ),
    ).toBe(true)
  })

  it('strips control characters from the device name it will print', () => {
    const { relay } = setup()
    const created = relay.create(hostKey())
    relay.claim(created.id, claimBody('  Pixel\u0000 8‮  '))
    expect(relay.hostView(created.id).joiner?.deviceName).toBe('Pixel 8')
  })
})
