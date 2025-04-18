import { type ArxHub, Plugin, type PluginArgs } from '@arxhub/core'
import { VirtualFileSystemExtension } from './extension'
import manifest from './manifest'

export class VirtualFileSystemPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(target: ArxHub): void {
    target.extensions.register(VirtualFileSystemExtension)
  }
}
