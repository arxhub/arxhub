import { FileNotFound, type VirtualFile, type VirtualFileSystem } from '@arxhub/vfs'
import type { Snapshot } from 'src/types'

/**
 * Represents a repository that interacts with a VirtualFileSystem (VFS) to manage snapshots,
 * similar to a Git repository.
 *
 * The file structure within the VFS for a `Repo` instance is as follows:
 *
 * - `/repo/head`: This file stores the hash of the current head snapshot. It acts as a pointer
 *   to the latest committed state of the repository.
 * - `/repo/snapshots/{hash}`: This directory (or a similar structure) would typically store
 *   individual snapshot objects, where `{hash}` is the unique identifier (hash) of the snapshot.
 *   Each snapshot object contains metadata about the repository's state at a specific point in time,
 *   including a list of files and their corresponding content hashes.
 * - `/repo/objects/{hash}`: This directory (or a similar structure) would store the actual content
 *   of files (blobs) and directories (trees), identified by their content hash. This allows for
 *   deduplication of file content across different snapshots.
 *
 * This class provides methods to interact with this structure, such as retrieving the head snapshot,
 * downloading and uploading files/chunks based on snapshots, and updating the head.
 */
export class Repo {
  protected readonly vfs: VirtualFileSystem
  private _head: Snapshot | null

  constructor(vfs: VirtualFileSystem) {
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

    const file = await this.vfs.file(`/repo/head`)
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
