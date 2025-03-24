import { type ArxHub, Plugin } from '@arxhub/core'
import { GatewayExtension } from './extension'
import { Gateway } from './gateway'

export class GatewayPlugin extends Plugin<ArxHub> {
  constructor() {
    super({
      name: GatewayPlugin.name,
      version: '0.1.0',
      author: '',
    })
  }

  override async create(target: ArxHub): Promise<void> {
    const gateway = new Gateway()
    target.extensions.add(new GatewayExtension(gateway))
  }

  override async configure(target: ArxHub): Promise<void> {
    const { gateway } = target.extensions.getByType(GatewayExtension)
    gateway.get('/healthcheck', (c) => c.text('200 OK'))
  }

  override start(target: ArxHub): Promise<void> {
    const { gateway } = target.extensions.getByType(GatewayExtension)
    return gateway.serve()
  }

  override stop(target: ArxHub): Promise<void> {
    const { gateway } = target.extensions.getByType(GatewayExtension)
    return gateway.close()
  }
}

export default new GatewayPlugin()
