import type { Logger } from '@arxhub/core'
import { node } from '@elysiajs/node'
import Elysia, { type AnyElysia } from 'elysia'
import type { Server } from 'elysia/universal'

export class Gateway {
  private readonly logger: Logger
  private readonly elysia: Elysia
  private disposable: Server | null

  constructor(logger: Logger) {
    this.logger = logger
    this.elysia = new Elysia({ adapter: node() })
    this.disposable = null
  }

  use(plugin: AnyElysia): void {
    this.elysia.use(plugin)
  }

  async listen(port = 3000): Promise<void> {
    this.elysia.listen(port, (server) => {
      this.disposable = server
    })
    this.logger.info(`Listening on port: ${port}`)
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping')
    this.disposable?.stop(true)
    this.logger.info('Stopped')
  }
}
