import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import type { VirtualFile, VirtualFileSystem } from '@arxhub/vfs'
import type { Snapshot } from './types'

export class Repo {
  protected readonly vfs: VirtualFileSystem

  constructor(vfs: VirtualFileSystem) {
    this.vfs = vfs
  }

  async prepare(): Promise<void> {
    const hash = sha256('{}')
    const snapshot = this.getSnapshotFile(hash)
    const isSnapshotExists = await snapshot.isExists()
    if (!isSnapshotExists) {
      await snapshot.writeJSON({
        hash: hash,
        parent: null,
        timestamp: 0,
        files: {},.ge
      } satisfies Snapshot)
    }

    const head = this.getHeadFile()
    const isHeadExists = await head.isExists()
    if (!isHeadExists) {
      await head.writeText(hash)
    }
  }

  async getHeadSnapshot(): Promise<Snapshot> {
    const head = this.getHeadFile()
    const hash = await head.readText()
    return this.getSnapshotFile(hash).readJSON()
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
    if (await to.getSnapshotFile(hash).isExists()) {
      return
    }

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

  listSnapshots(): AsyncGenerator<VirtualFile> {
    return this.vfs.list('/repo/snapshots')
  }

  getChangesFile(): VirtualFile {
    return this.vfs.file(`/repo/changes`)
  }

  getHeadFile(): VirtualFile {
    return this.vfs.file(`/repo/head`)
  }

  getSnapshotFile(hash: string): VirtualFile {
    return this.vfs.file(`/repo/snapshots/${hash}`)
  }

  getChunkFile(hash: string): VirtualFile {
    return this.vfs.file(`/repo/chunks/${hash.substring(0, 2)}/${hash.substring(2, 4)}/${hash}`)
  }

  getManifestFile(hash: string): VirtualFile {
    return this.vfs.file(`/repo/manifests/${hash}`)
  }
}
