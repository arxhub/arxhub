import type { VirtualFileSystem } from '@arxhub/vfs'
import type { Snapshot } from 'src/types'

export class Repo {
  protected readonly vfs: VirtualFileSystem
  private _head: Snapshot | null

  constructor(vfs: VirtualFileSystem) {
    this.vfs = vfs
    this._head = null
  }

  protected async refreshHead(): Promise<Snapshot> {
    const file = await this.vfs.file(`/repo/head`)
    const head = (await file.isExists()) ? await file.readJSON<Snapshot>() : EMPTY_SNAPSHOT
    this._head = head
    return head
  }

  async head(): Promise<Snapshot> {
    return this._head == null ? this.refreshHead() : this._head
  }
}

const EMPTY_SNAPSHOT: Snapshot = {
  // Hash of an empty string
  hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  pathname: '/repo/head',
  timestamp: 0,
  files: {},
}
