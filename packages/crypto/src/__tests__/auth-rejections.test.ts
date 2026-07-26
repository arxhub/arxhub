import { describe, expect, test } from 'vitest'
import { type AuthRejection, authRejections } from '../auth-rejections'
import { keyringFromMnemonic } from '../keyring'
import { MutableRequestSigner } from '../request-auth'
import { signingMiddleware } from '../request-auth-middleware'

const MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

// Collects rejections for the duration of one test.
function collect(): { seen: AuthRejection[]; stop: () => void } {
  const seen: AuthRejection[] = []
  const stop = authRejections.subscribe((rejection) => seen.push(rejection))
  return { seen, stop }
}

// Drives the middleware exactly as wretch does: it wraps a `next` and returns the response.
function run(status: number, headers: Record<string, string> = {}, url = 'http://hub.test/api/vfs/write?path=vault%2Fa.md') {
  const signer = new MutableRequestSigner()
  signer.install(keyringFromMnemonic(MNEMONIC))
  const next = async () => new Response(null, { status, headers })
  return signingMiddleware(signer)(next)(url, { method: 'PUT' })
}

describe('signingMiddleware rejection reporting', () => {
  test('a 401 is reported with the reason the server named', async () => {
    const { seen, stop } = collect()
    try {
      await run(401, { 'x-arx-auth-reason': 'unknown-key' })
      expect(seen).toEqual([{ reason: 'unknown-key', method: 'PUT', path: '/api/vfs/write' }])
    } finally {
      stop()
    }
  })

  // A server that says nothing still has to produce a usable report — the UI falls back on its own copy.
  test('a 401 without the header is reported with a null reason', async () => {
    const { seen, stop } = collect()
    try {
      await run(401)
      expect(seen).toEqual([{ reason: null, method: 'PUT', path: '/api/vfs/write' }])
    } finally {
      stop()
    }
  })

  // The query can carry content (a vault path), so it must not reach a surface that shows it.
  test('the reported path excludes the query string', async () => {
    const { seen, stop } = collect()
    try {
      await run(401, {}, 'http://hub.test/api/vfs/read?path=vault%2Fsecret-diary.md')
      expect(seen[0]?.path).toBe('/api/vfs/read')
    } finally {
      stop()
    }
  })

  test.each([200, 204, 403, 404, 413, 500])('%i is not reported', async (status) => {
    const { seen, stop } = collect()
    try {
      await run(status)
      expect(seen).toEqual([])
    } finally {
      stop()
    }
  })

  test('the response reaches the caller unchanged', async () => {
    const response = await run(401, { 'x-arx-auth-reason': 'stale' })
    expect(response.status).toBe(401)
    expect(response.headers.get('x-arx-auth-reason')).toBe('stale')
  })

  // A listener that throws must not reject the response promise the caller is awaiting.
  test('a throwing listener does not break the request', async () => {
    const stop = authRejections.subscribe(() => {
      throw new Error('listener is broken')
    })
    try {
      const response = await run(401)
      expect(response.status).toBe(401)
    } finally {
      stop()
    }
  })

  test('unsubscribing stops the reports', async () => {
    const { seen, stop } = collect()
    stop()
    await run(401)
    expect(seen).toEqual([])
  })
})
