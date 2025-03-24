import type { Extension } from '@arxhub/core'
import type { Gateway } from './gateway'

export class GatewayExtension implements Extension {
  readonly name: string
  readonly gateway: Gateway

  constructor(gateway: Gateway) {
    this.name = GatewayExtension.name
    this.gateway = gateway
  }
}
