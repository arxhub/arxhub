import { Extension, type Logger } from '@arxhub/core'
import { MountableFileSystem, type SearchableFileSystem, type VirtualFileSystem } from '@arxhub/vfs'
import { PouchDBFileSystem } from './pouchdb-system'

export class VirtualFileSystemExtension extends Extension {
  private readonly mountable: MountableFileSystem
  private readonly searchable: SearchableFileSystem

  constructor(logger: Logger) {
    super(logger)
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
