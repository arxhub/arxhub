import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import manifest from '../manifest'
import { GatewayServerExtension } from './extension'
import { healthcheckRoute } from './routes/healthcheck'

export class GatewayServerPlugin extends Plugin {
  private readonly port: number
  // The instance is the only one who knows which build this is (the same __APP_VERSION__ its About page
  // shows), so it hands the number in rather than the plugin reading a package.json it does not own.
  private readonly version: string

  constructor({ port = 3000, version, ...args }: PluginArgs & { port?: number; version: string }) {
    super(args as PluginArgs, manifest)
    this.port = port
    this.version = version
  }

  override create(ctx: PluginContext): void {
    ctx.extensions.register(GatewayServerExtension)
  }

  override configure(ctx: PluginContext): void {
    const { gateway } = ctx.extensions.get(GatewayServerExtension)
    gateway.use(healthcheckRoute({ version: this.version }))
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
