import wretch, { type ConfiguredMiddleware } from 'wretch'
import QueryStringAddon from 'wretch/addons/queryString'

// Re-exported so callers can type their own middlewares without importing wretch directly.
export type { ConfiguredMiddleware } from 'wretch'

export interface HttpClientOptions {
  // Override the fetch implementation (mainly for tests / non-browser hosts). Defaults to global fetch.
  fetch?: typeof fetch
  // wretch middlewares applied in order — e.g. request signing (see @arxhub/crypto signingMiddleware).
  // This package stays a generic wretch wrapper; cross-cutting request behaviour is injected here.
  middlewares?: ConfiguredMiddleware[]
}

// Creates a configured wretch client: base URL + query-string support, plus any injected middlewares.
// Access HTTP through this package rather than calling fetch directly, so base URL and query encoding
// live in one place.
export function createHttpClient(baseUrl = '', options: HttpClientOptions = {}) {
  let client = wretch(baseUrl).addon(QueryStringAddon)
  if (options.fetch) client = client.polyfills({ fetch: options.fetch })
  if (options.middlewares?.length) client = client.middlewares(options.middlewares)
  return client
}

export type HttpClient = ReturnType<typeof createHttpClient>

export { default as wretch } from 'wretch'

export * from './typed-client'
