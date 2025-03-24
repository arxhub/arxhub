import type { Extension } from '@arxhub/core'
import { Gateway } from './gateway'

export class GatewayExtension implements Extension {
  readonly name: string
  readonly gateway: Gateway

  constructor() {
    this.name = GatewayExtension.name
    this.gateway = new Gateway()
  }
}
