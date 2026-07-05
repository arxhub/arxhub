import type { ConfiguredMiddleware } from 'wretch'
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

// Split an outgoing (possibly relative or absolute) URL into the pathname + raw query string the
// server will also see. Signing over these exact substrings — not a re-serialized param map — keeps
// client and server canonical strings byte-identical regardless of query ordering.
export function describeRequest(url: string, method: string, body: unknown): RequestDescriptor {
  const q = url.indexOf('?')
  const rawPath = q === -1 ? url : url.slice(0, q)
  const query = q === -1 ? '' : url.slice(q + 1)
  let path = rawPath
  const scheme = rawPath.indexOf('://')
  if (scheme !== -1) {
    const afterScheme = rawPath.slice(scheme + 3)
    const slash = afterScheme.indexOf('/')
    path = slash === -1 ? '/' : afterScheme.slice(slash)
  }
  return { method: method || 'GET', path, query, body: bodyToBytes(body) }
}

// wretch middleware that signs each request and attaches the auth headers. Runs at send time, so it
// sees the fully-assembled URL (query included) and body. A signer with no identity yet is a no-op —
// the request goes out unauthenticated.
export function signingMiddleware(signer: RequestSigner): ConfiguredMiddleware {
  return (next) => (url, opts) => {
    const headers = signer.sign(describeRequest(url, opts.method ?? 'GET', opts.body))
    if (headers == null) return next(url, opts)
    return next(url, {
      ...opts,
      headers: {
        ...opts.headers,
        [AUTH_HEADERS.timestamp]: headers.timestamp,
        [AUTH_HEADERS.nonce]: headers.nonce,
        [AUTH_HEADERS.signature]: headers.signature,
        [AUTH_HEADERS.publicKey]: headers.publicKey,
      },
    })
  }
}
