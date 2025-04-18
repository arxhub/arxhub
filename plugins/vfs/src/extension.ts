import { Extension, type ExtensionArgs } from '@arxhub/core'
import { MountableFileSystem } from './mountable-system'

export class VirtualFileSystemExtension extends Extension {
  readonly vfs: MountableFileSystem

  constructor(args: ExtensionArgs) {
    super(args)
    this.vfs = new MountableFileSystem()
  }
}
