import type { Extension } from '@arxhub/core'
import { MountableFileSystem } from './mountable-system'

export class VirtualFileSystemExtension implements Extension {
  readonly name: string
  readonly vfs: MountableFileSystem

  constructor() {
    this.name = VirtualFileSystemExtension.name
    this.vfs = new MountableFileSystem()
  }
}
