import { afterEach, describe, expect, test, vi } from 'vitest'
import type { FiscalReceipt } from '../model'
import { FnsReceiptClient } from '../server/fns-client'

const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/'
const SYNC_NS = 'urn://x-artefacts-gnivc-ru/inplat/servin/OpenApiMessageConsumerService/types/1.0'
const ASYNC_NS = 'urn://x-artefacts-gnivc-ru/inplat/servin/OpenApiAsyncMessageConsumerService/types/1.0'
const AUTH_NS = 'urn://x-artefacts-gnivc-ru/ais3/kkt/AuthService/types/1.0'
const TICKET_NS = 'urn://x-artefacts-gnivc-ru/ais3/kkt/KktTicketService/types/1.0'

const fiscal: FiscalReceipt = {
  fn: '1234567890123456',
  fd: '42',
  fp: '777',
  issuedAt: '2026-09-19T12:34',
  total: 250,
  operation: 1,
}

const receipt = () => ({
  fiscalDriveNumber: fiscal.fn,
  fiscalDocumentNumber: Number(fiscal.fd),
  fiscalSign: Number(fiscal.fp),
  dateTime: `${fiscal.issuedAt}:00`,
  totalSum: fiscal.total,
  operationType: fiscal.operation,
  user: 'Test merchant',
  items: [
    { name: 'Weighted item', quantity: 1.5, price: 100, sum: 150 },
    { name: 'Other item', quantity: 1, price: 100, sum: 100 },
  ],
})

const envelope = (content: string) =>
  `<?xml version="1.0"?><soap:Envelope xmlns:soap="${SOAP_NS}"><soap:Body>${content}</soap:Body></soap:Envelope>`

const response = (content: string) => new Response(envelope(content), { headers: { 'content-type': 'text/xml' } })

function authResponse(expiresAt = new Date(Date.now() + 3_600_000).toISOString(), namespace = AUTH_NS): Response {
  return response(
    `<m:GetMessageResponse xmlns:m="${SYNC_NS}"><m:Message><a:AuthResponse xmlns:a="${namespace}"><a:Result><a:Token>temporary-token</a:Token><a:ExpireTime>${expiresAt}</a:ExpireTime></a:Result></a:AuthResponse></m:Message></m:GetMessageResponse>`,
  )
}

function sentResponse(messageId: string): Response {
  return response(`<a:SendMessageResponse xmlns:a="${ASYNC_NS}"><a:MessageId>${messageId}</a:MessageId></a:SendMessageResponse>`)
}

function processingResponse(): Response {
  return response(`<a:GetMessageResponse xmlns:a="${ASYNC_NS}"><a:ProcessingStatus>PROCESSING</a:ProcessingStatus></a:GetMessageResponse>`)
}

function completedResponse(kind: 'check' | 'get', value: unknown = receipt()): Response {
  const result =
    kind === 'check'
      ? '<t:Result><t:Code>200</t:Code><t:Message>OK</t:Message></t:Result>'
      : `<t:Result><t:Code>200</t:Code><t:Ticket><![CDATA[${JSON.stringify(value)}]]></t:Ticket></t:Result>`
  const responseName = kind === 'check' ? 'CheckTicketResponse' : 'GetTicketResponse'
  return response(
    `<a:GetMessageResponse xmlns:a="${ASYNC_NS}"><a:ProcessingStatus>COMPLETED</a:ProcessingStatus><a:Message><t:${responseName} xmlns:t="${TICKET_NS}">${result}</t:${responseName}></a:Message></a:GetMessageResponse>`,
  )
}

function requestBody(init: RequestInit | undefined): string {
  if (typeof init?.body !== 'string') throw new Error('expected an XML request body')
  return init.body
}

function successfulFetch(options: { processingOnce?: boolean; returnedReceipt?: unknown } = {}) {
  let authCalls = 0
  let checkPolls = 0
  let sequence = 0
  const requests: Array<{ url: string; body: string; headers: Headers }> = []
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const body = requestBody(init)
    requests.push({ url: String(input), body, headers: new Headers(init?.headers) })
    if (String(input).endsWith('/open-api/AuthService/0.1')) {
      authCalls++
      return authResponse()
    }
    if (body.includes('SendMessageRequest')) {
      const kind = body.includes('CheckTicketRequest') ? 'check' : 'get'
      return sentResponse(`${kind}-${++sequence}`)
    }
    if (body.includes('check-')) {
      checkPolls++
      if (options.processingOnce && checkPolls === 1) return processingResponse()
      return completedResponse('check')
    }
    return completedResponse('get', options.returnedReceipt)
  }) as typeof globalThis.fetch
  return { fetch, requests, authCalls: () => authCalls, checkPolls: () => checkPolls }
}

function client(fetch: typeof globalThis.fetch, masterToken = 'master-token'): FnsReceiptClient {
  return new FnsReceiptClient({ baseUrl: 'https://fns.example', masterToken, fetch, pollDelayMs: 0 })
}

const lookup = (value: FnsReceiptClient, userId = 'xpub-test-user') =>
  value.lookup(fiscal, userId, { position: { latitude: 54.7104, longitude: 20.4522 } })

afterEach(() => {
  vi.useRealTimers()
})

describe('FnsReceiptClient protocol', () => {
  test('uses Auth, CheckTicket, and GetTicket with the WSDL SOAP actions and required headers', async () => {
    const mock = successfulFetch({ processingOnce: true })
    const result = await lookup(client(mock.fetch, 'master<&token'))

    expect(result).toEqual(receipt())
    expect(mock.requests.map(({ url }) => new URL(url).pathname)).toEqual([
      '/open-api/AuthService/0.1',
      '/open-api/ais3/KktService/0.1',
      '/open-api/ais3/KktService/0.1',
      '/open-api/ais3/KktService/0.1',
      '/open-api/ais3/KktService/0.1',
      '/open-api/ais3/KktService/0.1',
    ])
    expect(mock.requests.map(({ headers }) => headers.get('soapaction'))).toEqual([
      '"urn:GetMessageRequest"',
      '"urn:SendMessageRequest"',
      '"urn:GetMessageRequest"',
      '"urn:GetMessageRequest"',
      '"urn:SendMessageRequest"',
      '"urn:GetMessageRequest"',
    ])
    expect(mock.requests[0].body).toContain('<t:MasterToken>master&lt;&amp;token</t:MasterToken>')
    expect(mock.requests[1].body).toContain('<t:Date>2026-09-19T12:34:00</t:Date>')
    expect(mock.requests[1].body).toContain('<t:GeoInfo><t:Latitude>54.7104</t:Latitude><t:Longitude>20.4522</t:Longitude></t:GeoInfo>')
    expect(mock.requests[1].headers.get('fns-openapi-token')).toBe('temporary-token')
    const pseudonym = atob(mock.requests[1].headers.get('fns-openapi-usertoken') ?? '')
    expect(pseudonym).toMatch(/^[0-9a-f]{64}$/)
    expect(pseudonym).not.toContain('xpub-test-user')
    expect(mock.checkPolls()).toBe(2)
  })

  test('serializes concurrent authentication and reuses a token that is not near expiry', async () => {
    const mock = successfulFetch()
    const instance = client(mock.fetch)
    await Promise.all([lookup(instance, 'one'), lookup(instance, 'two')])
    await lookup(instance, 'three')
    expect(mock.authCalls()).toBe(1)
  })

  test('refreshes a cached token within its 30-second expiry margin', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-19T12:00:00Z'))
    let authCalls = 0
    const base = successfulFetch()
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith('/open-api/AuthService/0.1')) {
        authCalls++
        return authResponse(new Date(Date.now() + 40_000).toISOString())
      }
      return base.fetch(input, init)
    }) as typeof globalThis.fetch
    const instance = client(fetch)
    await lookup(instance)
    vi.setSystemTime(new Date('2026-09-19T12:00:15Z'))
    await lookup(instance)
    expect(authCalls).toBe(2)
  })

  test('stops after the bounded number of PROCESSING polls', async () => {
    let polls = 0
    const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const body = requestBody(init)
      if (String(input).endsWith('/open-api/AuthService/0.1')) return authResponse()
      if (body.includes('SendMessageRequest')) return sentResponse('check-pending')
      polls++
      return processingResponse()
    }) as typeof globalThis.fetch
    await expect(lookup(client(fetch))).rejects.toThrow(/still processing/)
    expect(polls).toBe(30)
  })

  test('rejects a valid receipt document whose fiscal identity does not match the request', async () => {
    const other = { ...receipt(), fiscalDocumentNumber: 43 }
    await expect(lookup(client(successfulFetch({ returnedReceipt: other }).fetch))).rejects.toThrow(/does not match/)
  })

  test('accepts the numeric Unix timestamp used by FNS while preserving the scanned local calendar time', async () => {
    const returned = { ...receipt(), dateTime: Date.UTC(2026, 8, 19, 12, 34) / 1000 }
    await expect(lookup(client(successfulFetch({ returnedReceipt: returned }).fetch))).resolves.toEqual(returned)
  })
})

describe('FnsReceiptClient defensive parsing', () => {
  test('requires FNS fields to appear in their declared XML namespace', async () => {
    const fetch = vi.fn(async () => authResponse(undefined, 'urn:attacker')) as typeof globalThis.fetch
    await expect(lookup(client(fetch))).rejects.toThrow(/Token/)
  })

  test.each([
    ['malformed XML', '<not-closed>'],
    ['DOCTYPE', '<!DOCTYPE x><x/>'],
  ])('rejects %s', async (_name, body) => {
    const fetch = vi.fn(async () => new Response(body)) as typeof globalThis.fetch
    await expect(lookup(client(fetch))).rejects.toThrow(/XML document|malformed XML/)
  })

  test('rejects an oversized response while streaming it', async () => {
    const fetch = vi.fn(async () => new Response('x'.repeat(4 * 1024 * 1024 + 1))) as typeof globalThis.fetch
    await expect(lookup(client(fetch))).rejects.toThrow(/response size/)
  })

  test('rejects invalid UTF-8 response bytes', async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([0xff]))) as typeof globalThis.fetch
    await expect(lookup(client(fetch))).rejects.toThrow(/valid UTF-8/)
  })

  test('validates the endpoint origin, credentials, and requested position before sending fiscal data', async () => {
    expect(() => new FnsReceiptClient({ baseUrl: 'not a URL', masterToken: 'token' })).toThrow(/HTTPS origin/)
    expect(() => new FnsReceiptClient({ baseUrl: 'http://fns.example', masterToken: 'token' })).toThrow(/HTTPS origin/)
    expect(() => new FnsReceiptClient({ baseUrl: 'https://fns.example/path', masterToken: 'token' })).toThrow(/HTTPS origin/)
    expect(() => new FnsReceiptClient({ baseUrl: 'https://fns.example', masterToken: ' ' })).toThrow(/empty/)
    const fetch = vi.fn() as unknown as typeof globalThis.fetch
    await expect(client(fetch).lookup(fiscal, 'user', { position: { latitude: 91, longitude: 0 } })).rejects.toThrow(/current location/)
    expect(fetch).not.toHaveBeenCalled()
  })

  test('wraps transport failures without exposing the request body or master token', async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      throw new Error(`transport failed for ${requestBody(init)}`)
    }) as typeof globalThis.fetch
    const error = await lookup(client(fetch, 'super-secret-master-token')).catch((cause: unknown) => cause)
    expect(error).toMatchObject({ body: { code: 'InternalServerError', message: 'Could not reach FNS to download the receipt. Retry later.' } })
    expect(String(error)).not.toContain('super-secret-master-token')
  })
})
