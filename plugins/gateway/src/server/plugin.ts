import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import manifest from '../manifest'
import { GatewayServerExtension } from './extension'
import { healthcheckRoute } from './routes/healthcheck'

export class GatewayServerPlugin extends Plugin {
  private readonly port: number

  constructor({ port = 3000, ...args }: PluginArgs & { port?: number }) {
    super(args as PluginArgs, manifest)
    this.port = port
  }

  override create(ctx: PluginContext): void {
    ctx.extensions.register(GatewayServerExtension)
  }

  override configure(ctx: PluginContext): void {
    const { gateway } = ctx.extensions.get(GatewayServerExtension)
    gateway.use(healthcheckRoute())
  }

  override start(ctx: PluginContext): Promise<void> {
    const { gateway } = ctx.extensions.get(GatewayServerExtension)
    return gateway.listen(this.port)
  }

  override stop(ctx: PluginContext): Promise<void> {
    const { gateway } = ctx.extensions.get(GatewayServerExtension)
    return gateway.stop()
  }
}
