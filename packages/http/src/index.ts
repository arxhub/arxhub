import { AUTH_HEADERS, type RequestDescriptor, type RequestSigner } from '@arxhub/crypto'
import wretch, { type ConfiguredMiddleware } from 'wretch'
import QueryStringAddon from 'wretch/addons/queryString'

export interface HttpClientOptions {
  // Override the fetch implementation (mainly for tests / non-browser hosts).
  // Defaults to the global fetch.
  fetch?: typeof fetch
  // When set, every request is signed and carries auth headers (see @arxhub/crypto request-auth).
  // A signer with no identity installed yet is a no-op — requests go out unauthenticated.
  signer?: RequestSigner
}

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
function describeRequest(url: string, method: string, body: unknown): RequestDescriptor {
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
// sees the fully-assembled URL (query included) and body.
function signingMiddleware(signer: RequestSigner): ConfiguredMiddleware {
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

// Creates a configured wretch client: base URL + query-string support, plus optional request signing.
// Access HTTP through this package rather than calling fetch directly, so request behaviour (base URL,
// query encoding, auth) lives in one place.
export function createHttpClient(baseUrl = '', options: HttpClientOptions = {}) {
  let client = wretch(baseUrl).addon(QueryStringAddon)
  if (options.fetch) client = client.polyfills({ fetch: options.fetch })
  if (options.signer) client = client.middlewares([signingMiddleware(options.signer)])
  return client
}

export type HttpClient = ReturnType<typeof createHttpClient>

export { default as wretch } from 'wretch'
