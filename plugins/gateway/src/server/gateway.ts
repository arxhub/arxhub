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
    this.elysia.listen(port, (server) => {
      this.disposable = server
    })
    this.port = port
    this.logger.info(`Listening on port: ${port}`)
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
