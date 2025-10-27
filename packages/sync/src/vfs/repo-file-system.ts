import { join } from 'node:path'
import type { VirtualFile, VirtualFileSystem } from '@arxhub/vfs'

/**
 * RepoFileSystem provides structured access to repository-specific files.
 *
 * This class manages three types of files:
 * 1. Head file - a text file at `/repo/head` containing the hash of the current snapshot
 * 2. Snapshot files - JSON files at `/repo/snapshots/{hash}` with information about all files in that snapshot
 * 3. Chunk files - data files in a nested structure at `/repo/chunks/{hash.substring(0, 2)}/{hash.substring(2, 4)}/{hash}`
 * 4. Manifests - JSON files at `/repo/manifests/{hash}` containing chunk lists for large files
 */
export class RepoFileSystem {
  private readonly vfs: VirtualFileSystem

  constructor(vfs: VirtualFileSystem) {
    this.vfs = vfs
  }

  file(pathname: string): VirtualFile {
    return this.vfs.file(join('/', 'data', pathname))
  }

  getChangesFile(): VirtualFile {
    return this.file(`/repo/changes`)
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
