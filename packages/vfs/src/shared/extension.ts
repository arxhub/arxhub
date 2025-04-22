import { Extension, type ExtensionArgs } from '@arxhub/core'
import { MountableFileSystem } from './mountable-system'
import { PouchDBFileSystem } from './pouchdb-system'
import type { SearchableFileSystem } from './searchable-system'
import type { VirtualFileSystem } from './system'

export class VirtualFileSystemExtension extends Extension {
  private readonly mountable: MountableFileSystem
  private readonly searchable: SearchableFileSystem

  constructor(args: ExtensionArgs) {
    super(args)
    this.mountable = new MountableFileSystem()
    this.searchable = new PouchDBFileSystem(this.mountable)
  }

  get files(): SearchableFileSystem {
    return this.searchable
  }

  mount(mountpoint: string, vfs: VirtualFileSystem): void {
    this.mountable.mount(mountpoint, vfs)
  }

  unmount(mountpoint: string): void {
    this.mountable.unmount(mountpoint)
  }
}
