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

// Builds the same RequestDescriptor the client signed (see @arxhub/http describeRequest): method, the
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
}

function isPublicRead(method: string, pathname: string, prefixes: string[]): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`))
}

// A global Elysia guard: every request must carry a valid signature (see @arxhub/crypto request-auth).
// onRequest fires for all routes on the merged gateway app, so this protects every mounted route
// (including vfsRoutes) regardless of registration order.
export function createAuthGuard(authenticator: RequestAuthenticator, logger?: Logger, options: AuthGuardOptions = {}): AnyElysia {
  const publicGetPrefixes = options.publicGetPrefixes ?? []
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  return new Elysia({ name: 'protection-guard' }).onRequest(async ({ request, set }) => {
    const url = new URL(request.url)
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
    logger?.warn(`Rejected request to ${new URL(request.url).pathname}: ${result.reason}`)
    set.status = 401
    return 'Unauthorized'
  })
}

const manifest = definePluginManifest({
  name: 'ProtectionServer',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Authenticates gateway requests via signed challenges with TOFU key pinning',
})

export interface ProtectionServerPluginArgs extends PluginArgs, RequestAuthenticatorOptions, AuthGuardOptions {}

// Mounts the auth guard onto the gateway during configure(). Register alongside GatewayServerPlugin and
// before/after VfsHttpServerPlugin — the guard is a global onRequest hook, so mount order does not
// affect coverage. Pass `pinnedPublicKey` (e.g. from an env var) to disable TOFU.
export class ProtectionServerPlugin extends Plugin {
  private readonly authenticator: RequestAuthenticator
  private readonly publicGetPrefixes?: string[]
  private readonly maxBodyBytes?: number

  constructor(args: ProtectionServerPluginArgs) {
    super(args, manifest)
    this.publicGetPrefixes = args.publicGetPrefixes
    this.maxBodyBytes = args.maxBodyBytes
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
      this.logger.warn('No pinned client key — trust-on-first-use is OPEN: the first valid signer will be paired. Set ARXHUB_SYNC_PUBKEY to close it.')
    }
    const { gateway } = ctx.extensions.get(GatewayServerExtension)
    gateway.use(createAuthGuard(this.authenticator, this.logger, { publicGetPrefixes: this.publicGetPrefixes, maxBodyBytes: this.maxBodyBytes }))
  }
}
