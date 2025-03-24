import { type ArxHub, Plugin } from '@arxhub/core'
import { GatewayExtension } from '@arxhub/plugin-gateway/api'
import { VirtualFileSystemExtension } from '@arxhub/plugin-vfs/api'
import { files } from './files'
import type { FilesEnv } from './types'

export class GatewayVFSPlugin extends Plugin<ArxHub> {
  constructor() {
    super({
      name: GatewayVFSPlugin.name,
      version: '0.1.0',
      author: '',
    })
  }

  async configure(target: ArxHub): Promise<void> {
    const { vfs } = target.extensions.getByType(VirtualFileSystemExtension)
    const { gateway } = target.extensions.getByType(GatewayExtension)

    gateway.use<string, FilesEnv>('/vfs/*', async (ctx, next) => {
      ctx.set('vfs', vfs)
      await next()
    })
    gateway.route('/vfs', files)
  }
}

export default new GatewayVFSPlugin()
