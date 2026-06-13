import type { ArxHub } from '@arxhub/core'
import { Plugin, type PluginArgs, RootVfs } from '@arxhub/core'
import { ScopedFileSystem } from '@arxhub/vfs'
import { manifest } from './manifest'
import { VfsExtension } from './vfs-extension'

export class VfsPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(arxhub: ArxHub): void {
    super.create(arxhub)
    // The shared user-content view: everything under vault/, prefix-scoped so consumers see
    // content-relative paths and cannot reach other top-level areas (storage/, state/, temp/).
    // The root fs comes from the DI services container (bound by the instance).
    const root = this.container.get(RootVfs).fs
    const vault = new ScopedFileSystem(root, 'vault')
    arxhub.extensions.register(VfsExtension, () => ({ vfs: vault }))
  }
}
