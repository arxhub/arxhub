import { type ArxHub, Plugin, type PluginArgs } from '@arxhub/core'
import manifest from '../manifest'
import { GatewayServerExtension } from './extension'
import { healthcheckRoute } from './routes/healthcheck'

export class GatewayServerPlugin extends Plugin<ArxHub> {
  private readonly port: number

  constructor({ port = 3000, ...args }: PluginArgs & { port?: number }) {
    super(args as PluginArgs, manifest)
    this.port = port
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
    return gateway.listen(this.port)
  }

  override stop(target: ArxHub): Promise<void> {
    const { gateway } = target.extensions.get(GatewayServerExtension)
    return gateway.stop()
  }
}
