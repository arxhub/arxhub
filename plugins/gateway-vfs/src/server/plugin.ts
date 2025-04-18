import { type ArxHub, Plugin, type PluginArgs } from '@arxhub/core'
import { GatewayServerExtension } from '@arxhub/plugin-gateway/api'
import { VirtualFileSystemServerExtension } from '@arxhub/plugin-vfs/api'
import manifest from '../manifest'
import { filesRoute } from './routes/files'

export class GatewayVFSServerPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override configure(target: ArxHub): void {
    const { files: vfs } = target.extensions.get(VirtualFileSystemServerExtension)
    const { gateway } = target.extensions.get(GatewayServerExtension)

    gateway.use(filesRoute('/vfs/files', vfs))
  }
}
