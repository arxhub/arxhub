import { Plugin, type PluginArgs } from '@arxhub/core'
import type { ArxHub } from '@arxhub/core'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { VfsExtension } from './vfs-extension'
import { manifest } from './manifest'

type VfsPluginArgs = PluginArgs & {
  vfs: VirtualFileSystem
}

export class VfsPlugin extends Plugin<ArxHub> {
  private readonly vfs: VirtualFileSystem

  constructor(args: VfsPluginArgs) {
    super(args, manifest)
    this.vfs = args.vfs
  }

  override create(arxhub: ArxHub): void {
    super.create(arxhub)
    arxhub.extensions.register(VfsExtension, () => ({
      vfs: this.vfs,
    }))
  }
}
