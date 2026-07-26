import { AUTH_HEADERS, keyringFromMnemonic, MutableRequestSigner, type RequestDescriptor, signRequest } from '@arxhub/crypto'
import Elysia from 'elysia'
import { describe, expect, it } from 'vitest'
import { RequestAuthenticator } from '../authenticator'
import { createAuthGuard } from '../server'

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const OTHER = 'legal winner thank year wave sausage worth useful legal winner thank yellow'

// Build a protected app: the global guard + a couple of stand-in routes matching the VFS surface.
// .compile() so routes are resolvable synchronously under Elysia's .handle() test entrypoint.
function makeApp(auth = new RequestAuthenticator()) {
  return new Elysia()
    .use(createAuthGuard(auth))
    .get('/vfs/list', () => ({ ok: true }))
    .put('/vfs/write', () => new Response(null, { status: 204 }))
    .compile()
}

// Turn signed headers into the header bag the client would send over the wire.
function authHeaderBag(signer: MutableRequestSigner, desc: RequestDescriptor): Record<string, string> {
  const h = signer.sign(desc)
  if (h == null) throw new Error('signer not installed')
  return {
    [AUTH_HEADERS.timestamp]: h.timestamp,
    [AUTH_HEADERS.nonce]: h.nonce,
    [AUTH_HEADERS.signature]: h.signature,
    [AUTH_HEADERS.publicKey]: h.publicKey,
  }
}

function signerFor(mnemonic: string): MutableRequestSigner {
  const signer = new MutableRequestSigner()
  signer.install(keyringFromMnemonic(mnemonic))
  return signer
}

describe('createAuthGuard (Elysia integration)', () => {
  it('rejects an unsigned GET with 401', async () => {
    const res = await makeApp().handle(new Request('http://localhost/vfs/list?prefix='))
    expect(res.status).toBe(401)
  })

  it('accepts a correctly-signed GET (200) and pins the key (TOFU)', async () => {
    const auth = new RequestAuthenticator()
    const app = makeApp(auth)
    const signer = signerFor(MNEMONIC)
    const headers = authHeaderBag(signer, { method: 'GET', host: 'localhost', path: '/vfs/list', query: 'prefix=' })

    const res = await app.handle(new Request('http://localhost/vfs/list?prefix=', { headers }))
    expect(res.status).toBe(200)
    expect(auth.pinnedPublicKey).toBe(keyringFromMnemonic(MNEMONIC).authPublicKey)
  })

  it('accepts a correctly-signed PUT with a body (body hash matches)', async () => {
    const app = makeApp()
    const signer = signerFor(MNEMONIC)
    const body = new TextEncoder().encode('note contents')
    const headers = authHeaderBag(signer, { method: 'PUT', host: 'localhost', path: '/vfs/write', query: 'path=note.md', body })

    const res = await app.handle(new Request('http://localhost/vfs/write?path=note.md', { method: 'PUT', body, headers }))
    expect(res.status).toBe(204)
  })

  it('rejects a second key once one is pinned', async () => {
    const auth = new RequestAuthenticator()
    const app = makeApp(auth)
    await app.handle(
      new Request('http://localhost/vfs/list?prefix=', {
        headers: authHeaderBag(signerFor(MNEMONIC), { method: 'GET', host: 'localhost', path: '/vfs/list', query: 'prefix=' }),
      }),
    )

    const attacker = authHeaderBag(signerFor(OTHER), { method: 'GET', host: 'localhost', path: '/vfs/list', query: 'prefix=' })
    const res = await app.handle(new Request('http://localhost/vfs/list?prefix=', { headers: attacker }))
    expect(res.status).toBe(401)
  })

  it('rejects a signature lifted onto a different path (tamper)', async () => {
    const app = makeApp()
    const signer = signerFor(MNEMONIC)
    // Sign for /vfs/list but replay the headers against /vfs/write.
    const headers = authHeaderBag(signer, { method: 'GET', host: 'localhost', path: '/vfs/list', query: 'prefix=' })
    const res = await app.handle(new Request('http://localhost/vfs/write?path=x', { method: 'PUT', body: new Uint8Array(), headers }))
    expect(res.status).toBe(401)
  })

  it('rejects a signature replayed against a different host (cross-server replay)', async () => {
    const app = makeApp()
    const signer = signerFor(MNEMONIC)
    // Signed for staging.example.com, replayed verbatim against this server (Host: localhost).
    const headers = authHeaderBag(signer, { method: 'GET', host: 'staging.example.com', path: '/vfs/list', query: 'prefix=' })
    const res = await app.handle(new Request('http://localhost/vfs/list?prefix=', { headers }))
    expect(res.status).toBe(401)
  })
})

// The client cannot tell a stale pin apart from a wrong clock from the status alone, and those have
// nothing to do with each other for the person holding the device. See AUTH_HEADERS.reason.
describe('createAuthGuard (naming the reason on a 401)', () => {
  it('says unknown-key when a second key is presented after one is pinned', async () => {
    const auth = new RequestAuthenticator()
    const app = makeApp(auth)
    const signed = (mnemonic: string) =>
      authHeaderBag(signerFor(mnemonic), { method: 'GET', host: 'localhost', path: '/vfs/list', query: 'prefix=' })
    await app.handle(new Request('http://localhost/vfs/list?prefix=', { headers: signed(MNEMONIC) }))

    const res = await app.handle(new Request('http://localhost/vfs/list?prefix=', { headers: signed(OTHER) }))
    expect(res.status).toBe(401)
    expect(res.headers.get(AUTH_HEADERS.reason)).toBe('unknown-key')
  })

  it('says missing when the request carries no signature at all', async () => {
    const res = await makeApp().handle(new Request('http://localhost/vfs/list?prefix='))
    expect(res.headers.get(AUTH_HEADERS.reason)).toBe('missing')
  })

  it('says stale when the signed timestamp is outside the freshness window', async () => {
    const app = makeApp()
    const keyring = keyringFromMnemonic(MNEMONIC)
    const desc: RequestDescriptor = { method: 'GET', host: 'localhost', path: '/vfs/list', query: 'prefix=' }
    const long = signRequest(keyring, desc, { timestamp: Math.floor(Date.now() / 1000) - 3600 })
    const headers = {
      [AUTH_HEADERS.timestamp]: long.timestamp,
      [AUTH_HEADERS.nonce]: long.nonce,
      [AUTH_HEADERS.signature]: long.signature,
      [AUTH_HEADERS.publicKey]: long.publicKey,
    }

    const res = await app.handle(new Request('http://localhost/vfs/list?prefix=', { headers }))
    expect(res.status).toBe(401)
    expect(res.headers.get(AUTH_HEADERS.reason)).toBe('stale')
  })

  // A browser hides every non-safelisted response header from JS unless it is exposed, so without this
  // a cross-origin client reads the 401 and learns nothing from it.
  it('exposes the reason header to a cross-origin client', async () => {
    const app = new Elysia()
      .use(createAuthGuard(new RequestAuthenticator(), undefined, { corsOrigins: '*' }))
      .get('/vfs/list', () => ({ ok: true }))
      .compile()

    const res = await app.handle(new Request('http://localhost/vfs/list', { headers: { origin: 'http://tauri.localhost' } }))
    expect(res.status).toBe(401)
    expect(res.headers.get('access-control-expose-headers')).toContain(AUTH_HEADERS.reason)
  })

  it('sets no reason on a request that succeeds', async () => {
    const app = makeApp()
    const headers = authHeaderBag(signerFor(MNEMONIC), { method: 'GET', host: 'localhost', path: '/vfs/list', query: 'prefix=' })
    const res = await app.handle(new Request('http://localhost/vfs/list?prefix=', { headers }))
    expect(res.status).toBe(200)
    expect(res.headers.get(AUTH_HEADERS.reason)).toBeNull()
  })
})

describe('createAuthGuard (body size cap)', () => {
  function makeCappedApp(maxBodyBytes: number) {
    return new Elysia()
      .use(createAuthGuard(new RequestAuthenticator(), undefined, { maxBodyBytes }))
      .put('/vfs/write', () => new Response(null, { status: 204 }))
      .compile()
  }

  it('rejects a body larger than the cap with 413 before authenticating', async () => {
    const app = makeCappedApp(16)
    const body = new Uint8Array(64)
    // Even a correctly-signed request is refused: the guard must never buffer past the cap.
    const headers = authHeaderBag(signerFor(MNEMONIC), { method: 'PUT', host: 'localhost', path: '/vfs/write', query: '', body })
    const res = await app.handle(new Request('http://localhost/vfs/write', { method: 'PUT', body, headers }))
    expect(res.status).toBe(413)
  })

  it('rejects an unsigned oversized body with 413 (no auth work wasted)', async () => {
    const res = await makeCappedApp(16).handle(new Request('http://localhost/vfs/write', { method: 'PUT', body: new Uint8Array(64) }))
    expect(res.status).toBe(413)
  })

  it('accepts a signed body under the cap', async () => {
    const app = makeCappedApp(16)
    const body = new TextEncoder().encode('tiny')
    const headers = authHeaderBag(signerFor(MNEMONIC), { method: 'PUT', host: 'localhost', path: '/vfs/write', query: '', body })
    const res = await app.handle(new Request('http://localhost/vfs/write', { method: 'PUT', body, headers }))
    expect(res.status).toBe(204)
  })
})

describe('createAuthGuard (public GET prefixes)', () => {
  // The published-content surface: GET under /p is world-readable, everything else stays guarded.
  function makePublicApp() {
    return new Elysia()
      .use(createAuthGuard(new RequestAuthenticator(), undefined, { publicGetPrefixes: ['/p'] }))
      .get('/p', () => 'public root')
      .get('/p/*', () => 'public')
      .put('/p/page.html', () => 'nope')
      .get('/pwned', () => 'secret')
      .get('/vfs/list', () => ({ ok: true }))
      .compile()
  }

  it('serves an unsigned GET under the public prefix', async () => {
    const res = await makePublicApp().handle(new Request('http://localhost/p/notes/page.html'))
    expect(res.status).toBe(200)
  })

  it('serves an unsigned GET of the prefix root itself', async () => {
    const res = await makePublicApp().handle(new Request('http://localhost/p'))
    expect(res.status).toBe(200)
  })

  it('still rejects an unsigned GET outside the prefix', async () => {
    const res = await makePublicApp().handle(new Request('http://localhost/vfs/list?prefix='))
    expect(res.status).toBe(401)
  })

  it('does not treat a prefix-sharing path as public (/p vs /pwned)', async () => {
    const res = await makePublicApp().handle(new Request('http://localhost/pwned'))
    expect(res.status).toBe(401)
  })

  it('never exempts writes, even under the public prefix', async () => {
    const res = await makePublicApp().handle(new Request('http://localhost/p/page.html', { method: 'PUT', body: 'x' }))
    expect(res.status).toBe(401)
  })
})

describe('createAuthGuard (CORS for cross-origin clients)', () => {
  // A desktop webview / web SPA on another origin.
  const ORIGIN = 'http://tauri.localhost'

  function makeCorsApp(corsOrigins: string[] | '*') {
    return new Elysia()
      .use(createAuthGuard(new RequestAuthenticator(), undefined, { corsOrigins }))
      .get('/vfs/list', () => ({ ok: true }))
      .put('/vfs/write', () => new Response(null, { status: 204 }))
      .compile()
  }

  it('answers an OPTIONS preflight with 204 + CORS headers WITHOUT requiring a signature (the bug that blocked desktop→server sync)', async () => {
    const res = await makeCorsApp('*').handle(
      new Request('http://localhost/vfs/write', {
        method: 'OPTIONS',
        headers: {
          origin: ORIGIN,
          'access-control-request-method': 'PUT',
          'access-control-request-headers': 'x-arx-signature,content-type',
        },
      }),
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-headers')).toContain('x-arx-signature')
    expect(res.headers.get('access-control-allow-methods')).toContain('PUT')
  })

  it('stamps Access-Control-Allow-Origin on a 401 too, so the browser can read the outcome', async () => {
    const res = await makeCorsApp('*').handle(new Request('http://localhost/vfs/list', { headers: { origin: ORIGIN } }))
    expect(res.status).toBe(401)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('echoes an allow-listed origin (with Vary: Origin) and refuses an unlisted one', async () => {
    const app = makeCorsApp([ORIGIN])
    const allowed = await app.handle(new Request('http://localhost/vfs/list', { headers: { origin: ORIGIN } }))
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(allowed.headers.get('vary')).toBe('Origin')

    const denied = await app.handle(new Request('http://localhost/vfs/list', { headers: { origin: 'http://evil.example' } }))
    expect(denied.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('emits no CORS headers when corsOrigins is unset (same-origin default unchanged)', async () => {
    const app = new Elysia()
      .use(createAuthGuard(new RequestAuthenticator()))
      .get('/vfs/list', () => ({ ok: true }))
      .compile()
    const res = await app.handle(new Request('http://localhost/vfs/list', { headers: { origin: ORIGIN } }))
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })
})
