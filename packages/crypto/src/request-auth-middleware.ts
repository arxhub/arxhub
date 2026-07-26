import type { ConfiguredMiddleware } from 'wretch'
import { authRejections } from './auth-rejections'
import { AUTH_HEADERS, type RequestDescriptor, type RequestSigner } from './request-auth'

// Turns a RequestSigner into a wretch middleware — the client-transport glue that lives here (with the
// signer/auth-header domain) rather than in @arxhub/http, which stays a generic wretch wrapper. wretch
// is a type-only import: erased at build, no runtime dependency.

function bodyToBytes(body: unknown): Uint8Array | undefined {
  if (body == null) return undefined
  if (body instanceof Uint8Array) return body
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  if (typeof body === 'string') return new TextEncoder().encode(body)
  return undefined
}

// Split an outgoing (possibly relative or absolute) URL into the host + pathname + raw query string
// the server will also see. Signing over these exact substrings — not a re-serialized param map —
// keeps client and server canonical strings byte-identical regardless of query ordering. The host
// binds the signature to the targeted server: from the URL when absolute, else the browser origin
// (a relative URL can only ever reach location.host, which is exactly what the Host header carries).
export function describeRequest(url: string, method: string, body: unknown): RequestDescriptor {
  const q = url.indexOf('?')
  const rawPath = q === -1 ? url : url.slice(0, q)
  const query = q === -1 ? '' : url.slice(q + 1)
  let path = rawPath
  let host = globalThis.location?.host ?? ''
  const scheme = rawPath.indexOf('://')
  if (scheme !== -1) {
    // URL-parse the authority (not a raw slice): it normalizes exactly like the server's parse of
    // its own request URL — lowercased hostname, default port stripped — so 'HTTPS://Hub.X.com:443'
    // and the server-observed 'hub.x.com' produce the same canonical string.
    host = new URL(rawPath).host
    const afterScheme = rawPath.slice(scheme + 3)
    const slash = afterScheme.indexOf('/')
    path = slash === -1 ? '/' : afterScheme.slice(slash)
  }
  return { method: method || 'GET', host, path, query, body: bodyToBytes(body) }
}

// wretch middleware that signs each request and attaches the auth headers. Runs at send time, so it
// sees the fully-assembled URL (query included) and body. A signer with no identity yet is a no-op —
// the request goes out unauthenticated.
//
// It also reports every 401 to `authRejections`. This is the one point every signed client passes
// through, which is why the observation lives here rather than in each caller's error handling: a
// server that refuses this device refuses ALL of them, and that is one condition to show the user, not
// a failure for each of them to discover.
export function signingMiddleware(signer: RequestSigner): ConfiguredMiddleware {
  return (next) => async (url, opts) => {
    const method = opts.method ?? 'GET'
    const desc = describeRequest(url, method, opts.body)
    const headers = signer.sign(desc)
    const response =
      headers == null
        ? await next(url, opts)
        : await next(url, {
            ...opts,
            headers: {
              ...opts.headers,
              [AUTH_HEADERS.timestamp]: headers.timestamp,
              [AUTH_HEADERS.nonce]: headers.nonce,
              [AUTH_HEADERS.signature]: headers.signature,
              [AUTH_HEADERS.publicKey]: headers.publicKey,
            },
          })
    // An unsigned request is reported too: it 401s for a reason worth naming ('missing' — no identity
    // was installed) rather than one worth hiding.
    if (response.status === 401) {
      authRejections.notify({ reason: response.headers.get(AUTH_HEADERS.reason), method, path: desc.path })
    }
    return response
  }
}
