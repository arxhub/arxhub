import { Extension, type ExtensionArgs } from '@arxhub/core'
import { MountableFileSystem, type SearchableFileSystem, type VirtualFileSystem } from '@arxhub/vfs'
import { PouchDBFileSystem } from './pouchdb-file-system'

export class VirtualFileSystemExtension extends Extension {
  private readonly mountable: MountableFileSystem
  private readonly searchable: SearchableFileSystem

  constructor(args: ExtensionArgs) {
    super(args)
    this.mountable = new MountableFileSystem()
    // TODO: Pass searchable instance/factory with args, to make it configurable
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
