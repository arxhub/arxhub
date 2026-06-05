import wretch from 'wretch'
import QueryStringAddon from 'wretch/addons/queryString'

export interface HttpClientOptions {
  // Override the fetch implementation (mainly for tests / non-browser hosts).
  // Defaults to the global fetch.
  fetch?: typeof fetch
}

// Creates a configured wretch client: base URL + query-string support.
// Access HTTP through this package rather than calling fetch directly, so
// request behaviour (base URL, query encoding, future retries/auth) lives in one place.
export function createHttpClient(baseUrl = '', options: HttpClientOptions = {}) {
  let client = wretch(baseUrl).addon(QueryStringAddon)
  if (options.fetch) client = client.polyfills({ fetch: options.fetch })
  return client
}

export type HttpClient = ReturnType<typeof createHttpClient>

export { default as wretch } from 'wretch'
