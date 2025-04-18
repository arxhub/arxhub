import type { ArxHub, PluginArgs } from '@arxhub/core'
import { Plugin } from '@arxhub/core'
import { GatewayServerExtension } from '@arxhub/plugin-gateway/api'
import manifest from '../manifest'
import { entrypointRoute } from './routes/entrypoint'

export class WebAppServerPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override configure(target: ArxHub): void {
    this.logger.info('Plugin configuring...')

    const { gateway } = target.extensions.get(GatewayServerExtension)
    gateway.use(entrypointRoute())
  }
}

export default WebAppServerPlugin
