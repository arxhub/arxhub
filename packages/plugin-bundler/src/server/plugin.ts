import { type ArxHub, Plugin, type PluginArgs } from '@arxhub/core'
import { VirtualFileSystemServerExtension } from '@arxhub/plugin-vfs/server'
import manifest from '../manifest'
import { BundlerServerExtension } from './extension'

export class BundlerServerPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(target: ArxHub): void {
    const { files } = target.extensions.get(VirtualFileSystemServerExtension)
    target.extensions.register(BundlerServerExtension, () => ({ vfs: files }))
  }

  override async start(target: ArxHub): Promise<void> {
    const { bundler } = target.extensions.get(BundlerServerExtension)
    for (const type of bundler.modules) {
      await bundler.build(type)
    }
  }
}
