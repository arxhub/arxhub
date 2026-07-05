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

// Builds the same RequestDescriptor the client signed (see @arxhub/http describeRequest): method, the
// URL pathname and raw query string, and the raw request body. The body is read from a clone so the
// original stream is left intact for the route handler.
async function describe(request: Request): Promise<RequestDescriptor> {
  const url = new URL(request.url)
  const method = request.method.toUpperCase()
  let body: Uint8Array | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    const buffer = await request.clone().arrayBuffer()
    body = buffer.byteLength > 0 ? new Uint8Array(buffer) : undefined
  }
  return { method, path: url.pathname, query: url.search.replace(/^\?/, ''), body }
}

export interface AuthGuardOptions {
  // Method-restricted public allowlist: a GET/HEAD request whose pathname falls under one of these
  // prefixes skips authentication entirely (e.g. '/p' for published pages). This is the ONE
  // deliberate hole in the guard — it never applies to writes, and each prefix must be an
  // explicitly public, read-only surface.
  publicGetPrefixes?: string[]
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
  return new Elysia({ name: 'protection-guard' }).onRequest(async ({ request, set }) => {
    const url = new URL(request.url)
    if (isPublicRead(request.method.toUpperCase(), url.pathname, publicGetPrefixes)) return
    const result = authenticator.authenticate(await describe(request), readAuthHeaders(request.headers), Math.floor(Date.now() / 1000))
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

  constructor(args: ProtectionServerPluginArgs) {
    super(args, manifest)
    this.publicGetPrefixes = args.publicGetPrefixes
    this.authenticator = new RequestAuthenticator({
      pinnedPublicKey: args.pinnedPublicKey,
      toleranceSeconds: args.toleranceSeconds,
      onPair: args.onPair,
    })
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    const { gateway } = ctx.extensions.get(GatewayServerExtension)
    gateway.use(createAuthGuard(this.authenticator, this.logger, { publicGetPrefixes: this.publicGetPrefixes }))
  }
}
