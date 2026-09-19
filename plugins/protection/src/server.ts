import { definePluginManifest, type Logger, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { AUTH_HEADERS, type RequestDescriptor, type SignedRequestHeaders } from '@arxhub/crypto'
import { GatewayServerExtension } from '@arxhub/plugin-gateway/server'
import Elysia, { type AnyElysia } from 'elysia'
import { RequestAuthenticator, type RequestAuthenticatorOptions } from './authenticator'

export { RequestAuthenticator, type RequestAuthenticatorOptions } from './authenticator'

function readAuthHeaders(headers: Headers): SignedRequestHeaders | null {
  const timestamp = headers.get(AUTH_HEADERS.timestamp)
  const nonce = headers.get(AUTH_HEADERS.nonce)
  const signature = headers.get(AUTH_HEADERS.signature)
  const publicKey = headers.get(AUTH_HEADERS.publicKey)
  if (!timestamp || !nonce || !signature || !publicKey) return null
  return { timestamp, nonce, signature, publicKey }
}

// The guard buffers the request body (for the signed body hash) BEFORE the auth verdict, so the
// buffering itself must be bounded or an unauthenticated client could exhaust server memory. 64 MiB
// matches the sync put-frame ceiling — the largest legitimate body on the gateway.
const DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024

// Reads the cloned request body while enforcing the cap DURING the read, so a missing or lying
// content-length can't cause unbounded buffering. Returns null once the body exceeds maxBytes.
async function readBodyBounded(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const stream = request.clone().body
  if (stream == null) return new Uint8Array()
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    // Early return releases the reader; the clone's stream is simply abandoned.
    if (total > maxBytes) return null
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

// Builds the same RequestDescriptor the client signed (see @arxhub/crypto describeRequest): method, the
// URL pathname and raw query string, and the raw request body. The body is read from a clone so the
// original stream is left intact for the route handler. Returns null when the body exceeds
// maxBodyBytes — rejected on the declared content-length first (cheap), then enforced while reading
// (a client can omit or understate the header).
async function describe(request: Request, maxBodyBytes: number): Promise<RequestDescriptor | null> {
  const url = new URL(request.url)
  const method = request.method.toUpperCase()
  let body: Uint8Array | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const declared = Number(request.headers.get('content-length') ?? '0')
    if (declared > maxBodyBytes) return null
    const bytes = await readBodyBounded(request, maxBodyBytes)
    if (bytes == null) return null
    body = bytes.byteLength > 0 ? bytes : undefined
  }
  // host comes from the request's Host header (via request.url) — binding the signature to THIS
  // server. A reverse proxy must forward Host unchanged (nginx: proxy_set_header Host $host).
  return { method, host: url.host, path: url.pathname, query: url.search.replace(/^\?/, ''), body }
}

export interface AuthGuardOptions {
  // Method-restricted public allowlist: a GET/HEAD request whose pathname falls under one of these
  // prefixes skips authentication entirely (e.g. '/p' for published pages). This is the ONE
  // deliberate hole in the guard — it never applies to writes, and each prefix must be an
  // explicitly public, read-only surface.
  publicGetPrefixes?: string[]
  // Upper bound (bytes) on a request body accepted for authentication; larger requests are rejected
  // with 413 before their body is buffered. Defaults to the sync put-frame ceiling (64 MiB).
  maxBodyBytes?: number
  // Origins allowed to call this server cross-origin (a Tauri desktop/mobile app or a web SPA served
  // from a different origin). '*' allows any; a list echoes only matching origins (with Vary: Origin).
  // Safe to open wide because auth is a per-request signature, NOT an ambient credential (cookie): a
  // hostile page still cannot forge a signature. Default undefined = no CORS headers (same-origin only).
  corsOrigins?: string[] | '*'
}

function isPublicRead(method: string, pathname: string, prefixes: string[]): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false
  // FR-43: liveness probes must not depend on each composition root remembering the prefix.
  if (pathname === '/healthcheck') return true
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))
}

// Headers the signed-request client attaches; the browser must be told they're allowed on cross-origin
// requests or the preflight fails. content-type covers the octet-stream/json bodies.
const CORS_ALLOWED_HEADERS = [AUTH_HEADERS.timestamp, AUTH_HEADERS.nonce, AUTH_HEADERS.signature, AUTH_HEADERS.publicKey, 'content-type'].join(
  ', ',
)

// Resolve the Access-Control-Allow-Origin value for this request, or null when CORS is off or the
// request's Origin isn't allowed (→ no CORS headers, browser blocks it).
function resolveAllowOrigin(corsOrigins: string[] | '*' | undefined, requestOrigin: string | null): string | null {
  if (corsOrigins == null) return null
  if (corsOrigins === '*') return '*'
  if (requestOrigin != null && corsOrigins.includes(requestOrigin)) return requestOrigin
  return null
}

// A global Elysia guard: every request must carry a valid signature (see @arxhub/crypto request-auth).
// onRequest fires for all routes on the merged gateway app, so this protects every mounted route
// (including vfsRoutes) regardless of registration order.
export function createAuthGuard(authenticator: RequestAuthenticator, logger?: Logger, options: AuthGuardOptions = {}): AnyElysia {
  const publicGetPrefixes = options.publicGetPrefixes ?? []
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  const corsOrigins = options.corsOrigins
  return new Elysia({ name: 'protection-guard' }).onRequest(async ({ request, set }) => {
    const url = new URL(request.url)

    // CORS. Resolve the allowed origin once and stamp it on EVERY response (incl. 401/413) so the
    // browser can actually read the outcome instead of masking it as an opaque CORS failure.
    const allowOrigin = resolveAllowOrigin(corsOrigins, request.headers.get('origin'))
    if (allowOrigin != null) {
      set.headers['access-control-allow-origin'] = allowOrigin
      if (allowOrigin !== '*') set.headers.vary = 'Origin'
      // Without this the reason header below is invisible to a cross-origin client: browsers hide every
      // non-safelisted response header from JS unless it is named here.
      set.headers['access-control-expose-headers'] = AUTH_HEADERS.reason
    }
    // Preflight: answer BEFORE auth. An OPTIONS carries no signature (the browser sends it on its own
    // to negotiate the custom x-arx-* headers), so authenticating it would 401 every cross-origin
    // request. It exposes nothing — it only announces which methods/headers the real request may use.
    // Return a bodyless Response directly (a 204 must carry no body — set.status + a '' body makes
    // Elysia build an invalid 204, see bug-316) with the CORS headers on the Response itself.
    if (request.method === 'OPTIONS') {
      const headers: Record<string, string> = {}
      if (allowOrigin != null) {
        headers['access-control-allow-origin'] = allowOrigin
        if (allowOrigin !== '*') headers.vary = 'Origin'
        headers['access-control-allow-methods'] = 'GET, HEAD, POST, PUT, DELETE'
        headers['access-control-allow-headers'] = CORS_ALLOWED_HEADERS
        headers['access-control-max-age'] = '600'
      }
      return new Response(null, { status: 204, headers })
    }

    if (isPublicRead(request.method.toUpperCase(), url.pathname, publicGetPrefixes)) return
    const desc = await describe(request, maxBodyBytes)
    if (desc == null) {
      logger?.warn(`Rejected oversized request body to ${url.pathname}`)
      set.status = 413
      return 'Payload Too Large'
    }
    const result = authenticator.authenticate(desc, readAuthHeaders(request.headers), Math.floor(Date.now() / 1000))
    if (result.ok) {
      if (result.pairedNow) logger?.info(`Paired client key ${result.publicKey.slice(0, 16)}…`)
      return
    }
    logger?.warn(`Rejected request to ${url.pathname}: ${result.reason}`)
    // Name the reason on the wire, coarsely. The 401 already tells the caller it was refused; which of
    // the five reasons it was tells nothing an attacker could not establish by trying, and it is what
    // lets the client say "this device is not the paired one" (act on it) instead of "request failed".
    set.headers[AUTH_HEADERS.reason] = result.reason
    set.status = 401
    return 'Unauthorized'
  })
}

const manifest = definePluginManifest({
  name: 'ProtectionServer',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Authenticates gateway requests via signed challenges with TOFU key pinning',
  // Switching this off would leave the vault open to anyone who can reach the port. A recovery boot
  // must not be a way to get there.
  essential: true,
})

export interface ProtectionServerPluginArgs extends PluginArgs, RequestAuthenticatorOptions, AuthGuardOptions {}

// Mounts the auth guard onto the gateway during configure(). Register alongside GatewayServerPlugin and
// before/after VfsHttpServerPlugin — the guard is a global onRequest hook, so mount order does not
// affect coverage. Pass `pinnedPublicKey` (e.g. from an env var) to disable TOFU.
export class ProtectionServerPlugin extends Plugin {
  private readonly authenticator: RequestAuthenticator
  private readonly publicGetPrefixes?: string[]
  private readonly maxBodyBytes?: number
  private readonly corsOrigins?: string[] | '*'

  constructor(args: ProtectionServerPluginArgs) {
    super(args, manifest)
    this.publicGetPrefixes = args.publicGetPrefixes
    this.maxBodyBytes = args.maxBodyBytes
    this.corsOrigins = args.corsOrigins
    this.authenticator = new RequestAuthenticator({
      pinnedPublicKey: args.pinnedPublicKey,
      toleranceSeconds: args.toleranceSeconds,
      onPair: args.onPair,
    })
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    // The TOFU window is a first-boot race: until a key is pinned, whoever reaches the server first
    // becomes the paired device. Loud so an operator exposing the port pre-pairing knows the stakes.
    if (this.authenticator.pinnedPublicKey == null) {
      this.logger.warn(
        'No pinned client key — trust-on-first-use is OPEN: the first valid signer will be paired. Set ARXHUB_SYNC_PUBKEY to close it.',
      )
    }
    const { gateway } = ctx.extensions.get(GatewayServerExtension)
    gateway.use(
      createAuthGuard(this.authenticator, this.logger, {
        publicGetPrefixes: this.publicGetPrefixes,
        maxBodyBytes: this.maxBodyBytes,
        corsOrigins: this.corsOrigins,
      }),
    )
  }
}
