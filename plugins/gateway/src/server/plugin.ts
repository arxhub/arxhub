import { type ArxHub, Plugin, type PluginManifest } from '@arxhub/core'
import manifest from '../manifest'
import { GatewayServerExtension } from './extension'
import { healthcheckRoute } from './routes/healthcheck'

export class GatewayServerPlugin extends Plugin<ArxHub> {
  get manifest(): PluginManifest {
    return manifest
  }

  override create(target: ArxHub): void {
    target.extensions.register(GatewayServerExtension)
  }

  override configure(target: ArxHub): void {
    const { gateway } = target.extensions.get(GatewayServerExtension)
    gateway.use(healthcheckRoute())
  }

  override start(target: ArxHub): Promise<void> {
    const { gateway } = target.extensions.get(GatewayServerExtension)
    return gateway.listen()
  }

  override stop(target: ArxHub): Promise<void> {
    const { gateway } = target.extensions.get(GatewayServerExtension)
    return gateway.stop()
  }
}
