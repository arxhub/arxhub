import type { Logger } from '@arxhub/core'
import { node } from '@elysiajs/node'
import Elysia, { type AnyElysia } from 'elysia'

export class Gateway {
  private readonly logger: Logger
  private readonly elysia: Elysia

  constructor(logger: Logger) {
    this.logger = logger
    this.elysia = new Elysia({ adapter: node() })
  }

  use(plugin: AnyElysia): void {
    this.elysia.use(plugin)
  }

  async listen(port = 3000): Promise<void> {
    this.elysia.listen(port)
    this.logger.info(`Listening on port: ${port}`)
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping')
    await this.elysia.stop()
    this.logger.info('Stopped')
  }
}
