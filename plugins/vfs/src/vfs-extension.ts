import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { VirtualFileSystem } from '@arxhub/vfs'

type VfsExtensionArgs = ExtensionArgs & {
  vfs: VirtualFileSystem
}

export class VfsExtension extends Extension {
  readonly vfs: VirtualFileSystem

  constructor(args: VfsExtensionArgs) {
    super(args)
    this.vfs = args.vfs
  }
}
