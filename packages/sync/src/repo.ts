import { FileNotFound, type VirtualFileSystem } from '@arxhub/vfs'
import type { Snapshot } from 'src/types'

export class Repo<VFS extends VirtualFileSystem = VirtualFileSystem> {
  protected readonly vfs: VFS
  private _head: Snapshot | null

  constructor(vfs: VFS) {
    this.vfs = vfs
    this._head = null
  }

  async head(skipCache?: boolean): Promise<Snapshot> {
    if (this._head == null || skipCache) {
      const file = await this.vfs.file(`/repo/head`)
      const head = (await file.isExists()) ? await file.readJSON<Snapshot>() : EMPTY_SNAPSHOT
      this._head = head
    }

    return this._head
  }

  // Only download files with chunks from, by given snapshot hash
  async download(from: Repo, hash: string = 'head'): Promise<Snapshot> {}

  // Only upload files with chunks to, by given snapshot hash
  async upload(to: Repo, hash: string = 'head'): Promise<Snapshot> {}

  async updateHead(hash: string): Promise<void> {
    const isSnapshotExists = await this.vfs.isFileExists(`/repo/snapshots/${hash}`)
    if (!isSnapshotExists) throw new FileNotFound(`/repo/snapshots/${hash}`)

    const file = this.vfs.file(`/repo/head`)
    await file.writeText(hash)
    await this.head(true)
  }
}

const EMPTY_SNAPSHOT: Snapshot = {
  // Hash of an empty string
  hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  pathname: '/repo/head',
  timestamp: 0,
  files: {},
}
