import { type ArxHub, Plugin, type PluginArgs } from '@arxhub/core'
import manifest from '../manifest'
import { VirtualFileSystemExtension } from './extension'

export class VirtualFileSystemPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(target: ArxHub): void {
    target.extensions.register(VirtualFileSystemExtension)
  }
}
