import { Extension } from '~/core/extension.ts'
import { CompositeFileSystem } from '~/plugins/vfs/composite_file_system.ts'

export class VirtualFileSystemExtension implements Extension {
  readonly name: string
  readonly vfs: CompositeFileSystem

  constructor() {
    this.name = VirtualFileSystemExtension.name
    this.vfs = new CompositeFileSystem('VFS')
  }
}
