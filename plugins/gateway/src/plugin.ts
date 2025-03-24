import { type ArxHub, Plugin } from '@arxhub/core'
import { GatewayExtension } from './extension'
import { Gateway } from './gateway'

export class GatewayPlugin extends Plugin<ArxHub> {
  constructor() {
    super({
      name: 'gateway',
      version: '0.1.0',
      author: '',
    })
  }

  apply(target: ArxHub): void {
    const gateway = new Gateway()
    target.extensions.add(new GatewayExtension(gateway))
  }

  start(target: ArxHub): Promise<void> {
    const { gateway } = target.extensions.getByType(GatewayExtension)
    return gateway.serve()
  }

  stop(target: ArxHub): Promise<void> {
    const { gateway } = target.extensions.getByType(GatewayExtension)
    return gateway.close()
  }
}

export default new GatewayPlugin()
