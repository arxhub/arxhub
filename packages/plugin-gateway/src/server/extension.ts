import { Extension, type ExtensionArgs } from '@arxhub/core'
import { Gateway } from './gateway'

export class GatewayServerExtension extends Extension {
  readonly gateway: Gateway

  constructor(args: ExtensionArgs) {
    super(args)
    this.gateway = new Gateway(this.logger)
  }
}
