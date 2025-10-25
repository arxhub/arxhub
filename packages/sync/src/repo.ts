import type { VirtualFile, VirtualFileSystem } from '@arxhub/vfs'
import type { Snapshot } from 'src/types'

export class Repo<VFS extends VirtualFileSystem = VirtualFileSystem> {
  protected readonly vfs: VFS

  constructor(vfs: VFS) {
    this.vfs = vfs
  }

  async download(from: Repo, hash: string): Promise<void> {
    const snapshot = await from.getSnapshotFile(hash).readJSON<Snapshot>()

    for (const pathname in snapshot.files) {
      const file = snapshot.files[pathname]

      for (const chunk of file.chunks) {
        const toChunkFile = this.getChunkFile(chunk.hash)
        if (!(await toChunkFile.isExists())) {
          const fromChunkFile = from.getChunkFile(chunk.hash)
          const readable = await fromChunkFile.readable()
          const writable = await toChunkFile.writable()
          await readable.pipeTo(writable)
        }
      }
    }

    await this.getSnapshotFile(hash).writeJSON(snapshot)
  }

  async upload(to: Repo, hash: string): Promise<void> {
    const snapshot = await this.getSnapshotFile(hash).readJSON<Snapshot>()

    for (const pathname in snapshot.files) {
      const file = snapshot.files[pathname]

      for (const chunk of file.chunks) {
        const toChunkFile = to.getChunkFile(chunk.hash)
        if (!(await toChunkFile.isExists())) {
          const fromChunkFile = this.getChunkFile(chunk.hash)
          const readable = await fromChunkFile.readable()
          const writable = await toChunkFile.writable()
          await readable.pipeTo(writable)
        }
      }
    }

    await to.getSnapshotFile(snapshot.hash).writeJSON(snapshot)
  }

  getSnapshotFile(hash: string): VirtualFile {
    return this.vfs.file(`/repo/snapshots/${hash}`)
  }

  getChunkFile(hash: string): VirtualFile {
    return this.vfs.file(`/repo/chunks/${hash.substring(0, 2)}/${hash.substring(2, 4)}/${hash}`)
  }
}
