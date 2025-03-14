import type { ArxHub, Plugin } from '@arxhub/core'
import { GatewayExtension } from './extension'

export class GatewayPlugin implements Plugin<ArxHub> {
  readonly name: string

  constructor() {
    this.name = GatewayPlugin.name
  }

  apply(target: ArxHub): void {
    target.extensions.add(new GatewayExtension())
  }

  start(target: ArxHub): Promise<void> {
    const { gateway } = target.extensions.getByType(GatewayExtension)
    return gateway.serve()
  }

  stop(target: ArxHub): Promise<void> {
    const { gateway } = target.extensions.getByType(GatewayExtension)
    return gateway.shutdown()
  }
}
