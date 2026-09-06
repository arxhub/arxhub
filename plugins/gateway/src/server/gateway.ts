import { API_PREFIX, type Logger } from '@arxhub/core'
import { node } from '@elysiajs/node'
import Elysia, { type AnyElysia } from 'elysia'
import type { Server } from 'elysia/universal'

// `Server` from elysia/universal is the Bun-shaped type; under @elysiajs/node the same object also
// carries srvx's node handle, and that handle is the only place the real bind state lives.
type NodeBackedServer = { node?: { server?: { listening?: boolean } } }

function isListening(server: Server | null): boolean {
  return (server as NodeBackedServer | null)?.node?.server?.listening === true
}

export class Gateway {
  private readonly logger: Logger
  private readonly elysia: Elysia
  private disposable: Server | null
  port: number | null

  constructor(logger: Logger) {
    this.logger = logger
    this.elysia = new Elysia({ adapter: node() })
    this.disposable = null
    this.port = null
  }

  // Mount an app at the server root (no namespace). For cross-cutting apps only — the auth guard's
  // global onRequest, the healthcheck. Feature plugins mount via a NamespacedGateway (forPlugin).
  use(plugin: AnyElysia): void {
    this.elysia.use(plugin)
  }

  async listen(port = 3000): Promise<void> {
    // Two separate silences under @elysiajs/node, and together they made a server that never came up
    // report itself as listening. Handed a bare port number the adapter hardcodes `reusePort: true`;
    // Node answers that with ENOTSUP on macOS and srvx swallows the listen error, so nothing binds and
    // the process simply exits with no line saying why. The option form is the only way to turn it off
    // — a single-process server never wanted SO_REUSEPORT. And the listen callback fires whether or not
    // the bind happened, so it cannot be the "we are up" signal either; only srvx's node handle knows.
    const server = await new Promise<Server | null>((resolve) => {
      this.elysia.listen({ port, reusePort: false }, resolve)
      setTimeout(() => resolve(null), 500)
    })

    this.disposable = server
    this.port = port
    if (isListening(server)) this.logger.info(`Listening on port: ${port}`)
    else this.logger.error(`Could not bind port ${port} — the server did not come up, the app will have no storage`)
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping')
    this.disposable?.stop(true)
    this.port = null
    this.logger.info('Stopped')
  }
}

// A gateway view scoped to one plugin's namespace. `use(routes)` mounts the plugin's RELATIVE routes
// (e.g. `/head`, `/objects/stat`) under `/api/<namespace>`: arxhub owns the `/api` + namespace prefix,
// the plugin owns the route names below it — so route paths never hardcode the prefix, and clients
// target `<origin>/api/<namespace>`.
export class NamespacedGateway {
  private readonly gateway: Gateway
  private readonly namespace: string

  constructor(gateway: Gateway, namespace: string) {
    this.gateway = gateway
    this.namespace = namespace
  }

  use(routes: AnyElysia): void {
    this.gateway.use(new Elysia({ prefix: `${API_PREFIX}/${this.namespace}` }).use(routes))
  }
}
