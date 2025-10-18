import type { VirtualFileSystem } from '@arxhub/vfs'
import type { Snapshot } from 'src/types'

export class Repo {
  protected readonly vfs: VirtualFileSystem

  constructor(vfs: VirtualFileSystem) {
    this.vfs = vfs
  }

  // TODO: Should be cached in memory
  async head(): Promise<Snapshot> {
    return {
      hash: '',
      pathname: '',
      timestamp: 0,
      files: {},
    }
  }
}
