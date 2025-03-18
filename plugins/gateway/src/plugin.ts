import { type ArxHub, Plugin } from '@arxhub/core'
import { GatewayExtension } from './extension'

export class GatewayPlugin extends Plugin<ArxHub> {
  constructor() {
    super(GatewayPlugin.name, 'Server')
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
