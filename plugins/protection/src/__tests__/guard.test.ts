import { AUTH_HEADERS, keyringFromMnemonic, MutableRequestSigner, type RequestDescriptor } from '@arxhub/crypto'
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
    const headers = authHeaderBag(signer, { method: 'GET', path: '/vfs/list', query: 'prefix=' })

    const res = await app.handle(new Request('http://localhost/vfs/list?prefix=', { headers }))
    expect(res.status).toBe(200)
    expect(auth.pinnedPublicKey).toBe(keyringFromMnemonic(MNEMONIC).authPublicKey)
  })

  it('accepts a correctly-signed PUT with a body (body hash matches)', async () => {
    const app = makeApp()
    const signer = signerFor(MNEMONIC)
    const body = new TextEncoder().encode('note contents')
    const headers = authHeaderBag(signer, { method: 'PUT', path: '/vfs/write', query: 'path=note.md', body })

    const res = await app.handle(new Request('http://localhost/vfs/write?path=note.md', { method: 'PUT', body, headers }))
    expect(res.status).toBe(204)
  })

  it('rejects a second key once one is pinned', async () => {
    const auth = new RequestAuthenticator()
    const app = makeApp(auth)
    await app.handle(
      new Request('http://localhost/vfs/list?prefix=', {
        headers: authHeaderBag(signerFor(MNEMONIC), { method: 'GET', path: '/vfs/list', query: 'prefix=' }),
      }),
    )

    const attacker = authHeaderBag(signerFor(OTHER), { method: 'GET', path: '/vfs/list', query: 'prefix=' })
    const res = await app.handle(new Request('http://localhost/vfs/list?prefix=', { headers: attacker }))
    expect(res.status).toBe(401)
  })

  it('rejects a signature lifted onto a different path (tamper)', async () => {
    const app = makeApp()
    const signer = signerFor(MNEMONIC)
    // Sign for /vfs/list but replay the headers against /vfs/write.
    const headers = authHeaderBag(signer, { method: 'GET', path: '/vfs/list', query: 'prefix=' })
    const res = await app.handle(new Request('http://localhost/vfs/write?path=x', { method: 'PUT', body: new Uint8Array(), headers }))
    expect(res.status).toBe(401)
  })
})
