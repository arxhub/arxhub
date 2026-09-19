import { AUTH_HEADERS } from '@arxhub/crypto'
import { validation } from '@arxhub/errors'
import { createAuthGuard, RequestAuthenticator } from '@arxhub/plugin-protection/server'
import Elysia from 'elysia'
import { describe, expect, test, vi } from 'vitest'
import { fiscalQr } from '../fiscal'
import type { FiscalReceipt } from '../model'
import { readFnsConfig } from '../server/budget-server-plugin'
import { receiptRoutes } from '../server/receipt-routes'

const fiscal: FiscalReceipt = {
  fn: '1234567890123456',
  fd: '42',
  fp: '777',
  issuedAt: '2026-09-19T12:34',
  total: 250,
  operation: 1,
}

const body = (position = { latitude: 54.7104, longitude: 20.4522 }) => JSON.stringify({ qr: fiscalQr(fiscal), position })

function request(headers: HeadersInit = {}, requestBody = body()): Request {
  return new Request('http://localhost/receipt', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...Object.fromEntries(new Headers(headers)) },
    body: requestBody,
  })
}

describe('receiptRoutes', () => {
  test('passes the authenticated identity, fiscal key, abort signal, and actual position to the adapter', async () => {
    const returned = { document: { receipt: { ok: true } } }
    const lookup = vi.fn().mockResolvedValue(returned)
    const app = receiptRoutes({ lookup }).compile()
    const response = await app.handle(request({ [AUTH_HEADERS.publicKey]: 'xpub-pseudonym' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(returned)
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls[0][0]).toEqual(fiscal)
    expect(lookup.mock.calls[0][1]).toBe('xpub-pseudonym')
    expect(lookup.mock.calls[0][2]).toMatchObject({ position: { latitude: 54.7104, longitude: 20.4522 } })
    expect(lookup.mock.calls[0][2].signal).toBeInstanceOf(AbortSignal)
  })

  test('returns actionable AppError bodies for a missing identity, configuration, or invalid receipt', async () => {
    const lookup = vi.fn().mockRejectedValue(validation('FNS returned invalid receipt JSON.'))
    const noIdentity = await receiptRoutes({ lookup }).compile().handle(request())
    expect(noIdentity.status).toBe(401)
    await expect(noIdentity.json()).resolves.toMatchObject({ code: 'UnauthorizedError', statusCode: 401 })
    expect(lookup).not.toHaveBeenCalled()

    const noConfig = await receiptRoutes(null)
      .compile()
      .handle(request({ [AUTH_HEADERS.publicKey]: 'xpub' }))
    expect(noConfig.status).toBe(500)
    await expect(noConfig.json()).resolves.toMatchObject({ code: 'IllegalStateError', message: expect.stringContaining('not configured') })

    const invalid = await receiptRoutes({ lookup })
      .compile()
      .handle(request({ [AUTH_HEADERS.publicKey]: 'xpub' }))
    expect(invalid.status).toBe(400)
    await expect(invalid.json()).resolves.toMatchObject({ code: 'ValidationError', message: 'FNS returned invalid receipt JSON.' })
  })

  test('is refused by the real global auth guard before the route can trust an unsigned identity header', async () => {
    const lookup = vi.fn()
    const app = new Elysia()
      .use(createAuthGuard(new RequestAuthenticator({ pinnedPublicKey: 'paired-key' })))
      .use(receiptRoutes({ lookup }))
      .compile()
    const response = await app.handle(request({ [AUTH_HEADERS.publicKey]: 'forged-key' }))
    expect(response.status).toBe(401)
    expect(response.headers.get(AUTH_HEADERS.reason)).toBe('missing')
    expect(lookup).not.toHaveBeenCalled()
  })

  test('rejects an invalid position at the HTTP schema boundary', async () => {
    const lookup = vi.fn()
    const response = await receiptRoutes({ lookup })
      .compile()
      .handle(request({ [AUTH_HEADERS.publicKey]: 'xpub' }, body({ latitude: 91, longitude: 0 })))
    expect(response.status).toBe(422)
    expect(lookup).not.toHaveBeenCalled()
  })

  test('does not expose unexpected adapter error details in the HTTP response', async () => {
    const lookup = vi.fn().mockRejectedValue(new Error('secret transport internals'))
    const response = await receiptRoutes({ lookup })
      .compile()
      .handle(request({ [AUTH_HEADERS.publicKey]: 'xpub' }))
    expect(response.status).toBe(500)
    const json = (await response.json()) as { message: string }
    expect(json.message).toMatch(/Could not download this receipt/)
    expect(json.message).not.toContain('secret')
  })
})

describe('readFnsConfig', () => {
  test('keeps receipt lookup disabled when both settings are absent and trims a complete pair', () => {
    expect(readFnsConfig({})).toBeUndefined()
    expect(readFnsConfig({ ARXHUB_FNS_API_URL: '  ', ARXHUB_FNS_MASTER_TOKEN: '' })).toBeUndefined()
    expect(readFnsConfig({ ARXHUB_FNS_API_URL: ' https://fns.example ', ARXHUB_FNS_MASTER_TOKEN: ' token ' })).toEqual({
      baseUrl: 'https://fns.example',
      masterToken: 'token',
    })
  })

  test('fails boot configuration when only one credential is present', () => {
    expect(() => readFnsConfig({ ARXHUB_FNS_API_URL: 'https://fns.example' })).toThrow(/both/)
    expect(() => readFnsConfig({ ARXHUB_FNS_MASTER_TOKEN: 'token' })).toThrow(/both/)
  })
})
