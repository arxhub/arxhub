import { Extension, type Logger } from '@arxhub/core'
import { Gateway } from './gateway'

export class GatewayServerExtension extends Extension {
  readonly gateway: Gateway

  constructor(logger: Logger) {
    super(logger)
    this.gateway = new Gateway(logger)
  }
}
