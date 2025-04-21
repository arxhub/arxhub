import type { ArxHub, PluginArgs } from '@arxhub/core'
import { Plugin } from '@arxhub/core'
import { GatewayServerExtension } from '@arxhub/plugin-gateway/api'
import { LocalFileSystem, VirtualFileSystemServerExtension } from '@arxhub/plugin-vfs/api'
import manifest from '../manifest'
import { entrypointRoute } from './routes/entrypoint'
import { createWebComponentsRouter } from './routes/web-components'

export class WebAppServerPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override configure(target: ArxHub): void {
    this.logger.info('Plugin configuring...')

    const { gateway } = target.extensions.get(GatewayServerExtension)
    const vfs = target.extensions.get(VirtualFileSystemServerExtension)
    vfs.mount('/node_modules/@arxhub/plugin-web-app/files', new LocalFileSystem(`${__dirname}/files`))

    gateway.use(entrypointRoute(vfs.files))
    gateway.use(createWebComponentsRouter(vfs.files))
  }
}

export default WebAppServerPlugin
