import { API_PREFIX, type Logger } from '@arxhub/core'
import { node } from '@elysiajs/node'
import Elysia, { type AnyElysia } from 'elysia'
import type { Server } from 'elysia/universal'

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
    // "Listening" used to print unconditionally, right after the call, not from the bind callback. When
    // the bind itself failed (srvx under @elysiajs/node calls listen({ reusePort: true }), which
    // answers ENOTSUP on macOS + Node 22 and is swallowed) the log still cheerfully reported the server
    // as up. From the outside that looked like an app with a dead store and not one line saying why.
    // The message now comes from where binding actually happened, and its absence is a warning, not
    // silence — listen() either resolves the callback promptly or it never will, so a short bound wait
    // is enough to tell the two apart.
    const bound = await new Promise<boolean>((resolve) => {
      this.elysia.listen(port, (server) => {
        this.disposable = server
        resolve(true)
      })
      setTimeout(() => resolve(false), 500)
    })

    this.port = port
    if (bound) this.logger.info(`Listening on port: ${port}`)
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
