import { type ArxHub, Plugin } from '@arxhub/core'
import { GatewayExtension } from './extension'

export class GatewayPlugin extends Plugin<ArxHub> {
  constructor() {
    super({
      name: GatewayPlugin.name,
      version: '0.1.0',
      author: '',
    })
  }

  override create(target: ArxHub): void {
    target.extensions.register(GatewayExtension)
  }

  override configure(target: ArxHub): void {
    const { gateway } = target.extensions.get(GatewayExtension)
    gateway.get('/healthcheck', (c) => c.text('200 OK'))
  }

  override start(target: ArxHub): Promise<void> {
    const { gateway } = target.extensions.get(GatewayExtension)
    return gateway.serve()
  }

  override stop(target: ArxHub): Promise<void> {
    const { gateway } = target.extensions.get(GatewayExtension)
    return gateway.close()
  }
}
