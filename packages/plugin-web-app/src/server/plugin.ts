import type { ArxHub, PluginArgs } from '@arxhub/core'
import { Plugin } from '@arxhub/core'
import { GatewayServerExtension } from '@arxhub/plugin-gateway/api'
import { VirtualFileSystemServerExtension } from '@arxhub/plugin-vfs/api'
import manifest from '../manifest'
import { createClientBundleRouter as clientBundleRoute } from './routes/client-bundle'
import { entrypointRoute } from './routes/entrypoint'
import { createWebComponentsRouter as webComponentsRoute } from './routes/web-components'

export class WebAppServerPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override configure(target: ArxHub): void {
    this.logger.info('Plugin configuring...')

    const { gateway } = target.extensions.get(GatewayServerExtension)
    const vfs = target.extensions.get(VirtualFileSystemServerExtension)

    gateway.use(entrypointRoute())
    gateway.use(webComponentsRoute(vfs.files))
    gateway.use(clientBundleRoute(target.plugins.instances().map((it) => it.manifest)))
  }
}

export default WebAppServerPlugin
