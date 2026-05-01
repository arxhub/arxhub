import type { VirtualDir } from './interface'
import type { VirtualEntry } from '../virtual-entry'
import type { VirtualFileSystem } from '../virtual-file-system'
import type { VirtualWalker } from '../virtual-walker'

export class VirtualDirImpl implements VirtualDir {
  readonly kind = 'dir' as const
  readonly pathname: string
  private readonly _vfs: VirtualFileSystem

  constructor(vfs: VirtualFileSystem, pathname: string) {
    this._vfs = vfs
    this.pathname = pathname
  }

  list(): Promise<VirtualEntry[]> {
    return this._vfs.list(this.pathname)
  }

  walk(cursor?: string): VirtualWalker {
    return this._vfs.walk(this.pathname, cursor)
  }
}
