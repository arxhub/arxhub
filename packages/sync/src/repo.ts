import type { VirtualFileSystem } from '@arxhub/vfs'
import type { Snapshot } from 'src/types'
import { RepoFileSystem } from 'src/vfs/repo-file-system'

export class Repo {
  protected readonly vfs: RepoFileSystem

  constructor(vfs: VirtualFileSystem) {
    this.vfs = new RepoFileSystem(vfs)
  }

  async download(from: Repo, hash: string): Promise<void> {
    const snapshot = await from.vfs.getSnapshotFile(hash).readJSON<Snapshot>()

    for (const pathname in snapshot.files) {
      const file = snapshot.files[pathname]

      for (const chunk of file.chunks) {
        const toChunkFile = this.vfs.getChunkFile(chunk.hash)
        if (!(await toChunkFile.isExists())) {
          const fromChunkFile = from.vfs.getChunkFile(chunk.hash)
          const readable = await fromChunkFile.readable()
          const writable = await toChunkFile.writable()
          await readable.pipeTo(writable)
        }
      }
    }

    await this.vfs.getSnapshotFile(hash).writeJSON(snapshot)
  }

  async upload(to: Repo, hash: string): Promise<void> {
    const snapshot = await this.vfs.getSnapshotFile(hash).readJSON<Snapshot>()

    for (const pathname in snapshot.files) {
      const file = snapshot.files[pathname]

      for (const chunk of file.chunks) {
        const toChunkFile = to.vfs.getChunkFile(chunk.hash)
        if (!(await toChunkFile.isExists())) {
          const fromChunkFile = this.vfs.getChunkFile(chunk.hash)
          const readable = await fromChunkFile.readable()
          const writable = await toChunkFile.writable()
          await readable.pipeTo(writable)
        }
      }
    }

    await to.vfs.getSnapshotFile(snapshot.hash).writeJSON(snapshot)
  }
}

export const EMPTY_SNAPSHOT: Snapshot = {
  // hash of empty json object
  hash: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
  timestamp: 0,
  files: {},
}
