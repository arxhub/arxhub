import type { Extension } from '@arxhub/core'
import { CompositeFileSystem } from './composite-system'

export class VirtualFileSystemExtension implements Extension {
  readonly name: string
  readonly vfs: CompositeFileSystem

  constructor() {
    this.name = VirtualFileSystemExtension.name
    this.vfs = new CompositeFileSystem('composite')
  }
}
