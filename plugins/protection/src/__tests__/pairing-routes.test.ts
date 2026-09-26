import { API_PREFIX } from '@arxhub/core'
import {
  AUTH_HEADERS,
  generatePairingKeyPair,
  generatePairingNonce,
  keyringFromMnemonic,
  pairingCommit,
  signRequest,
  toB64Url,
} from '@arxhub/crypto'
import Elysia from 'elysia'
import { describe, expect, it } from 'vitest'
import { RequestAuthenticator } from '../authenticator'
import { pairingRoutes } from '../pairing/pairing-routes'
import { PairingRelay } from '../pairing/relay'
import { PAIR_TOKEN_HEADER, PAIRING_JOIN_PREFIX, PAIRING_NAMESPACE } from '../pairing/wire'
import { createAuthGuard } from '../server'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const BASE = `http://localhost${API_PREFIX}/${PAIRING_NAMESPACE}`

function makeApp(relay = new PairingRelay()) {
  return new Elysia()
    .use(createAuthGuard(new RequestAuthenticator(), undefined, { anonymousPrefixes: [PAIRING_JOIN_PREFIX], corsOrigins: '*' }))
    .use(new Elysia({ prefix: `${API_PREFIX}/${PAIRING_NAMESPACE}` }).use(pairingRoutes(relay)))
    .compile()
}

function json(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function signed(method: string, path: string, body?: unknown): Request {
  const raw = body === undefined ? undefined : JSON.stringify(body)
  const url = new URL(`${BASE}${path}`)
  const h = signRequest(keyringFromMnemonic(MNEMONIC), {
    method,
    host: url.host,
    path: url.pathname,
    query: '',
    body: raw === undefined ? undefined : new TextEncoder().encode(raw),
  })
  return json(method, path, body, {
    [AUTH_HEADERS.timestamp]: h.timestamp,
    [AUTH_HEADERS.nonce]: h.nonce,
    [AUTH_HEADERS.signature]: h.signature,
    [AUTH_HEADERS.publicKey]: h.publicKey,
  })
}

function claimBody() {
  const key = generatePairingKeyPair().publicKey
  return { joinerKey: toB64Url(key), commit: toB64Url(pairingCommit(generatePairingNonce(), key)), deviceName: 'Phone' }
}

describe('pairing routes behind the guard', () => {
  it('lets the joiner through unsigned and keeps the host routes signed', async () => {
    const app = makeApp()
    const hostKey = toB64Url(generatePairingKeyPair().publicKey)

    expect((await app.handle(json('POST', '/invitations', { hostKey }))).status).toBe(401)
    const created = await app.handle(signed('POST', '/invitations', { hostKey }))
    expect(created.status).toBe(201)
    const { id, code } = (await created.json()) as { id: string; code: string }
    expect((await app.handle(json('GET', `/invitations/${id}`))).status).toBe(401)

    const claim = await app.handle(json('POST', `/join/${code}`, claimBody()))
    expect(claim.status).toBe(200)
    const { token } = (await claim.json()) as { token: string }

    const view = await app.handle(json('GET', `/join/${id}`, undefined, { [PAIR_TOKEN_HEADER]: token }))
    expect(view.status).toBe(200)
    expect(await view.json()).toMatchObject({ state: 'claimed' })
    expect((await app.handle(json('GET', `/join/${id}`))).status).toBe(403)

    const hostView = await app.handle(signed('GET', `/invitations/${id}`))
    expect(await hostView.json()).toMatchObject({ state: 'claimed', joiner: { deviceName: 'Phone' } })
  })

  it('answers the relay’s refusals with their own status and body', async () => {
    const app = makeApp()
    const missing = await app.handle(json('POST', '/join/ZZZZ-ZZZZ', claimBody()))
    expect(missing.status).toBe(404)
    expect(await missing.json()).toMatchObject({ code: 'PairingNotFoundError' })
    const late = await app.handle(json('POST', `/join/${'A'.repeat(22)}/ack`, undefined, { [PAIR_TOKEN_HEADER]: 'x' }))
    expect(late.status).toBe(404)
  })

  it('puts retry-after on a rate limit', async () => {
    const app = makeApp()
    let last: Response | null = null
    for (let i = 0; i < 31; i++) last = await app.handle(json('POST', '/join/ZZZZ-ZZZZ', claimBody()))
    expect(last?.status).toBe(429)
    expect(last?.headers.get('retry-after')).toBe('60')
  })

  it('calls a malformed body a 400', async () => {
    const app = makeApp()
    const res = await app.handle(json('POST', '/join/ZZZZ-ZZZZ', { joinerKey: 'short', commit: 'x', deviceName: '' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ code: 'ValidationError' })
  })

  it('refuses an oversized anonymous body before parsing it', async () => {
    const app = makeApp()
    const res = await app.handle(json('POST', '/join/ZZZZ-ZZZZ', { ...claimBody(), deviceName: 'x'.repeat(9000) }))
    expect(res.status).toBe(413)
  })

  it('does not open anything else to unsigned writes', async () => {
    const app = makeApp()
    expect((await app.handle(json('POST', '/joined', claimBody()))).status).toBe(401)
    expect((await app.handle(json('DELETE', `/invitations/${'A'.repeat(22)}`))).status).toBe(401)
  })

  it('allows the token header cross-origin', async () => {
    const app = makeApp()
    const res = await app.handle(new Request(`${BASE}/join/x`, { method: 'OPTIONS', headers: { origin: 'https://app.example' } }))
    expect(res.headers.get('access-control-allow-headers')).toContain(PAIR_TOKEN_HEADER)
  })
})
