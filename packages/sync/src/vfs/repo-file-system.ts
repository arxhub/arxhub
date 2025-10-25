import type { VirtualFile, VirtualFileSystem } from '@arxhub/vfs'

export class RepoFileSystem {
  private readonly vfs: VirtualFileSystem

  constructor(vfs: VirtualFileSystem) {
    this.vfs = vfs
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
}
