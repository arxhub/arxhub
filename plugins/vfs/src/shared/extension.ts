import { Extension, type ExtensionArgs } from '@arxhub/core'
import { MountableFileSystem } from './mountable-system'
import type { VirtualFileSystem } from './system'

export class VirtualFileSystemExtension extends Extension {
  private readonly mountable: MountableFileSystem

  constructor(args: ExtensionArgs) {
    super(args)
    this.mountable = new MountableFileSystem()
  }

  get files(): VirtualFileSystem {
    return this.mountable
  }

  mount(mountpoint: string, vfs: VirtualFileSystem): void {
    this.mountable.mount(mountpoint, vfs)
  }

  unmount(mountpoint: string): void {
    this.mountable.unmount(mountpoint)
  }
}
