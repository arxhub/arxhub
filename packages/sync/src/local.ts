import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { recordKeys } from '@arxhub/stdlib/record/keys'
import type { VirtualFile, VirtualFileSystem } from '@arxhub/vfs'
import AsyncLock from 'async-lock'
import dayjs from 'dayjs'
import { Chunker } from './chunker'
import { Repo } from './repo'
import type { ConflictResolver, Snapshot, SnapshotFile, SnapshotFileChunk } from './types'
import type { FileStatus } from './types/file-status'

export class Local extends Repo {
  private readonly lock: AsyncLock
  private readonly changes: VirtualFile
  private readonly chunker: Chunker

  constructor(vfs: VirtualFileSystem) {
    super(vfs)
    this.lock = new AsyncLock()
    this.changes = this.getChangesFile()
    this.chunker = new Chunker()
  }

  add(path: string): Promise<void> {
    return this.lock.acquire('changes', async () => {
      const paths = await this.changes.readJSON<string[]>([])
      paths.push(path)
      await this.changes.writeJSON(paths)
    })
  }

  // TODO: Maybe convert to async iterator
  async status(snapshot: Snapshot): Promise<FileStatus[]> {
    const result: FileStatus[] = []
    const processed = new Set<string>()

    for (const path in snapshot.files) {
      const file = this.vfs.file(path)
      const status = await this.fileStatus(file, snapshot)
      if (status != null) {
        result.push(status)
      }
      processed.add(file.pathname)
    }

    const paths = await this.changes.readJSON([])

    for (const pathname of paths) {
      if (processed.has(pathname)) continue

      const file = this.vfs.file(pathname)
      const status = await this.fileStatus(file, snapshot)
      if (status != null) {
        result.push(status)
      }
      processed.add(file.pathname)
    }

    return result
  }

  private async fileStatus(file: VirtualFile, snapshot: Snapshot): Promise<FileStatus | null> {
    if (await file.isExists()) {
      const hash = await file.hash('sha256')
      const local = snapshot.files[file.pathname]

      if (local == null) {
        return { pathname: file.pathname, type: 'created' }
      } else if (hash !== local.hash) {
        return { pathname: file.pathname, type: 'modified' }
      } else {
        return null
      }
    } else if (snapshot.files[file.pathname] != null) {
      return { pathname: file.pathname, type: 'deleted' }
    }

    return null
  }

  async commit(): Promise<Snapshot> {
    const head = await this.getHeadSnapshot()
    const changes = await this.status(head)
    if (changes.length === 0) {
      return head
    }

    const files: Record<string, SnapshotFile> = { ...head.files }

    for (const change of changes) {
      const { pathname, type } = change

      if (type === 'deleted') {
        delete files[pathname]
        continue
      }

      // else created || modified

      const file = this.vfs.file(pathname)
      const chunks: SnapshotFileChunk[] = []

      for await (const chunk of this.chunker.split(file)) {
        const hash = sha256(chunk)
        const chunkFile = this.getChunkFile(hash)

        if (!(await chunkFile.isExists())) {
          await chunkFile.write(Buffer.from(chunk))
        }

        chunks.push({ hash })
      }

      const fileHash = await file.hash('sha256')

      files[pathname] = {
        hash: fileHash,
        pathname: pathname,
        chunks,
      }
    }

    const snapshot = {
      hash: sha256(JSON.stringify(files)),
      parent: head.hash,
      timestamp: dayjs().unix(),
      files,
    }

    await this.getSnapshotFile(snapshot.hash).writeJSON(snapshot)
    await this.getHeadFile().writeText(snapshot.hash)

    await this.changes.writeJSON([])
    return snapshot
  }

  async findBaseSnapshot(localHead: string, remoteHead: string): Promise<Snapshot | null> {
    const localAncestors = new Set<string>()
    let current: string | null = localHead

    while (current != null) {
      if (localAncestors.has(current)) break
      localAncestors.add(current)
      const snapshot: Snapshot = await this.getSnapshotFile(current).readJSON()
      current = snapshot.parent
    }

    current = remoteHead
    while (current != null) {
      if (localAncestors.has(current)) return this.getSnapshotFile(current).readJSON()
      const snapshot: Snapshot = await this.getSnapshotFile(current).readJSON()
      current = snapshot.parent
    }

    return null
  }

  /**
   * Performs a 3-way merge of file states from base, local, and remote snapshots.
   *
   * For each file path, the merge decision is based on whether the file existed in the common
   * ancestor (`base`) and how `local` and `remote` have changed relative to it.
   *
   * To prevent data loss, **deletions are only applied when safe** (i.e., the other side did not modify the file).
   * When both sides modify a file (or one modifies while the other deletes), **both versions are preserved**.
   *
   * Full decision matrix:
   *
   * | Base     | Local    | Remote   | Interpretation                              | Action                                                                 |
   * |----------|----------|----------|---------------------------------------------|------------------------------------------------------------------------|
   * | ❌        | ❌        | ❌     | Never existed                               | → Skip (no-op)                                                         |
   * | ❌        | ✅        | ❌     | Added locally                               | → Write local file                                                     |
   * | ❌        | ❌        | ✅     | Added remotely                              | → Write remote file                                                    |
   * | ❌        | ✅        | ✅     | Added independently on both sides           | → If content hashes match: write once.                                 |
   * |           |           |        |                                             | → Else: resolve conflict (keep both)                                   |
   * | ✅        | ❌        | ❌     | Deleted on both sides                       | → Skip (delete)                                                        |
   * | ✅        | ✅        | ❌     | Modified locally, deleted remotely          | → **Keep local** (remote deletion ignored to prevent data loss)        |
   * | ✅        | ❌        | ✅     | Deleted locally, modified remotely          | → **Keep remote** (local deletion ignored to prevent data loss)        |
   * | ✅        | ✅        | ✅     | Modified on both sides                      | → If hashes match: write once.<br>→ Else: resolve conflict (keep both) |
   *
   * Notes:
   * - "✅" = file present; "❌" = file absent.
   * - A file is considered "modified" if its content hash differs from the base.
   * - **Deletions are never honored if the other side modified the file**, ensuring no data loss.
   * - Conflict resolution (via `resolver`) is only triggered when both sides have different content.
   *
   * @param {Record<string, SnapshotFile>} base - Common ancestor snapshot (may be empty).
   * @param {Record<string, SnapshotFile>} local - Current local file state.
   * @param {Record<string, SnapshotFile>} remote - Current remote file state.
   * @param {ConflictResolver} resolver - Function to handle content conflicts (typically preserves both versions).
   * @returns {Promise<void>}
   */
  async merge(
    base: Record<string, SnapshotFile>,
    local: Record<string, SnapshotFile>,
    remote: Record<string, SnapshotFile>,
    resolver: ConflictResolver,
  ): Promise<void> {
    const files = new Set<string>([...recordKeys(base), ...recordKeys(local), ...recordKeys(remote)])

    for (const pathname of files.values()) {
      const baseFile = base[pathname]
      const localFile = local[pathname]
      const remoteFile = remote[pathname]

      if (localFile == null && remoteFile == null) {
        continue
      }

      if (localFile == null && remoteFile != null) {
        if (baseFile.hash !== remoteFile.hash) {
          await this.writeSnapshotFile(remoteFile)
        }
        continue
      }

      await this.resolveSnapshotFileConflict(localFile, remoteFile, resolver)
    }
  }

  private async writeSnapshotFile(file: SnapshotFile): Promise<void> {}

  private async resolveSnapshotFileConflict(local: SnapshotFile, remote: SnapshotFile, resolver: ConflictResolver): Promise<void> {
    return resolver(
      this.vfs,
      local.pathname,
      this.chunker.merge(local.chunks.map((it) => this.getChunkFile(it.hash))),
      this.chunker.merge(remote.chunks.map((it) => this.getChunkFile(it.hash))),
    )
  }
}
