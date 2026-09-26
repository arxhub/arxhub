import { API_PREFIX } from '@arxhub/core'
import { keyringFromMnemonic, toB64Url } from '@arxhub/crypto'
import { hasErrorCode } from '@arxhub/errors'
import Elysia from 'elysia'
import { describe, expect, it } from 'vitest'
import { RequestAuthenticator } from '../authenticator'
import { pairingRateLimited } from '../pairing/errors'
import { PairingHost, PairingJoiner } from '../pairing/pairing-client'
import { pairingRoutes } from '../pairing/pairing-routes'
import { PairingRelay } from '../pairing/relay'
import { PAIRING_JOIN_PREFIX, PAIRING_NAMESPACE, PAIRING_TTL_MS } from '../pairing/wire'
import { createAuthGuard } from '../server'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const SERVER = 'http://localhost'
// Just above the relay's 4 requests/s, so the joiner never trips its own limit.
const JOINER_POLL_MS = 260

function stand(relay: PairingRelay = new PairingRelay()) {
  const app = new Elysia()
    .use(createAuthGuard(new RequestAuthenticator(), undefined, { anonymousPrefixes: [PAIRING_JOIN_PREFIX] }))
    .use(new Elysia({ prefix: `${API_PREFIX}/${PAIRING_NAMESPACE}` }).use(pairingRoutes(relay)))
    .compile()
  const fetch = ((input: RequestInfo | URL, init?: RequestInit) => app.handle(new Request(input, init))) as typeof globalThis.fetch
  const host = new PairingHost({ server: SERVER, keyring: keyringFromMnemonic(MNEMONIC), mnemonic: MNEMONIC, fetch, pollMs: 5 })
  const joiner = (ref: string) => new PairingJoiner({ server: SERVER, ref, deviceName: 'Phone', fetch, pollMs: JOINER_POLL_MS })
  return { host, joiner }
}

async function until(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

describe('pairing clients against an in-process relay', () => {
  it('hands the phrase over once the digits match', async () => {
    const { host, joiner } = stand()
    const hostRun = host.start()
    await until(() => host.phase.value === 'waiting')
    const invitation = host.invitation.value
    expect(invitation?.qr).toContain(`id=${invitation?.id}`)

    const joining = joiner(invitation?.code ?? '')
    const received = joining.start()
    await until(() => host.phase.value === 'compare' && joining.sas.value != null)
    expect(host.sas.value).toMatch(/^\d{6}$/)
    expect(host.sas.value).toBe(joining.sas.value)
    expect(host.deviceName.value).toBe('Phone')

    joining.confirm()
    await host.confirm()
    expect(await received).toEqual({ v: 1, mnemonic: MNEMONIC, serverUrl: SERVER })
    expect(joining.phase.value).toBe('received')
    await hostRun
    expect(host.phase.value).toBe('done')
  })

  it('joins by the invitation id from a QR as well', async () => {
    const { host, joiner } = stand()
    const hostRun = host.start()
    await until(() => host.phase.value === 'waiting')
    const joining = joiner(host.invitation.value?.id ?? '')
    const received = joining.start()
    await until(() => host.phase.value === 'compare' && joining.phase.value === 'compare')
    joining.confirm()
    await host.confirm()
    expect((await received).mnemonic).toBe(MNEMONIC)
    await hostRun
  })

  it('stops the host when the joiner reveals a nonce other than the one it committed to', async () => {
    class TamperingRelay extends PairingRelay {
      override hostView(id: string) {
        const view = super.hostView(id)
        return view.joinerNonce == null ? view : { ...view, joinerNonce: toB64Url(new Uint8Array(16).fill(9)) }
      }
    }
    const { host, joiner } = stand(new TamperingRelay())
    const hostRun = host.start()
    await until(() => host.phase.value === 'waiting')
    const joining = joiner(host.invitation.value?.code ?? '')
    const received = joining.start()
    await hostRun
    expect(host.phase.value).toBe('failed')
    expect(hasErrorCode(host.error.value, 'PairingCommitMismatchError')).toBe(true)
    // The host ended the invitation, so the joiner learns at once instead of waiting out the timer.
    expect(hasErrorCode(await rejection(received), 'PairingCancelledError')).toBe(true)
    expect(joining.phase.value).toBe('cancelled')
  })

  it('opens nothing on the new device until the owner confirms the digits there too', async () => {
    const { host, joiner } = stand()
    const hostRun = host.start()
    await until(() => host.phase.value === 'waiting')
    const joining = joiner(host.invitation.value?.code ?? '')
    const received = joining.start()
    await until(() => host.phase.value === 'compare' && joining.phase.value === 'compare')
    await host.confirm()
    // Delivered on the relay, but the joiner keeps comparing.
    await new Promise((resolve) => setTimeout(resolve, JOINER_POLL_MS * 3))
    expect(joining.phase.value).toBe('compare')
    expect(host.phase.value).toBe('sending')
    joining.confirm()
    expect((await received).mnemonic).toBe(MNEMONIC)
    await hostRun
    expect(host.phase.value).toBe('done')
  })

  it('"They don\'t match" on the new device refuses the payload and ends the invitation', async () => {
    const { host, joiner } = stand()
    const hostRun = host.start()
    await until(() => host.phase.value === 'waiting')
    const joining = joiner(host.invitation.value?.code ?? '')
    const received = joining.start()
    await until(() => host.phase.value === 'compare' && joining.phase.value === 'compare')
    await host.confirm()
    await joining.reject()
    expect(hasErrorCode(await rejection(received), 'PairingSasMismatchError')).toBe(true)
    expect(joining.phase.value).toBe('failed')
    await hostRun
    expect(host.phase.value).toBe('failed')
  })

  it('pins the host nonce before the reveal leaves, so a relay cannot swap it after taking the reveal', async () => {
    class GrindingRelay extends PairingRelay {
      taken = 0
      override reveal(id: string, token: string | null, joinerNonce: string) {
        super.reveal(id, token, joinerNonce)
        this.taken++
        // Keeps the reveal but tells the joiner to try again.
        if (this.taken === 1) throw pairingRateLimited(0)
      }
      override joinerView(id: string, token: string | null) {
        const view = super.joinerView(id, token)
        return this.taken === 0 ? view : { ...view, state: 'nonced' as const, hostNonce: toB64Url(new Uint8Array(16).fill(7)) }
      }
    }
    const { host, joiner } = stand(new GrindingRelay())
    void host.start()
    await until(() => host.phase.value === 'waiting')
    const joining = joiner(host.invitation.value?.code ?? '')
    const received = joining.start()
    await until(() => joining.sas.value != null)
    const shown = joining.sas.value
    expect(hasErrorCode(await rejection(received), 'PairingCommitMismatchError')).toBe(true)
    expect(joining.phase.value).toBe('failed')
    expect(joining.sas.value).toBe(shown)
    await host.cancel()
  })

  it('"They don\'t match" burns the invitation and opens a new one', async () => {
    const { host, joiner } = stand()
    void host.start()
    await until(() => host.phase.value === 'waiting')
    const first = host.invitation.value
    const joining = joiner(first?.code ?? '')
    const received = joining.start()
    await until(() => host.phase.value === 'compare')
    void host.reject()
    await until(() => host.phase.value === 'waiting' && host.invitation.value?.id !== first?.id)
    expect(hasErrorCode(await rejection(received), 'PairingCancelledError')).toBe(true)
    await host.cancel()
    expect(host.phase.value).toBe('cancelled')
  })

  it('reports an expired invitation on both sides', async () => {
    const time = { now: Date.now() }
    const { host, joiner } = stand(new PairingRelay({ now: () => time.now }))
    const hostRun = host.start()
    await until(() => host.phase.value === 'waiting')
    time.now += PAIRING_TTL_MS
    await hostRun
    expect(host.phase.value).toBe('expired')
    const late = joiner(host.invitation.value?.code ?? '')
    expect(hasErrorCode(await rejection(late.start()), 'PairingNotFoundError')).toBe(true)
    expect(late.phase.value).toBe('failed')
  })

  it('refuses a code that cannot be one before asking the server', async () => {
    const { joiner } = stand()
    const joining = joiner('ABC-12')
    expect(hasErrorCode(await rejection(joining.start()), 'ValidationError')).toBe(true)
  })
})
