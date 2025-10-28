import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import type { VirtualFile, VirtualFileSystem } from '@arxhub/vfs'
import AsyncLock from 'async-lock'
import dayjs from 'dayjs'
import { Chunker } from './chunker'
import { EMPTY_SNAPSHOT, Repo } from './repo'
import type { Snapshot, SnapshotFile, SnapshotFileChunk } from './types'
import type { FileStatus } from './types/file-status'

export class Local extends Repo {
  private readonly lock: AsyncLock
  private readonly changes: VirtualFile
  private readonly chunker: Chunker

  constructor(vfs: VirtualFileSystem) {
    super(vfs)
    this.lock = new AsyncLock()
    this.changes = this.vfs.getChangesFile()
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
  async status(snapshot?: Snapshot): Promise<FileStatus[]> {
    if (snapshot == null) {
      const head = this.vfs.getHeadFile()
      snapshot = await head.readJSON(EMPTY_SNAPSHOT)
    }

    const result: FileStatus[] = []
    const processed = new Set<string>()

    for (const path in snapshot.files) {
      const file = this.vfs.file(path)
      const status = await this.fileStatus(file, snapshot)
      result.push(status)
      processed.add(file.pathname)
    }

    const paths = await this.changes.readJSON([])

    for (const pathname of paths) {
      if (processed.has(pathname)) continue

      const file = this.vfs.file(pathname)
      const status = await this.fileStatus(file, snapshot)
      result.push(status)
      processed.add(file.pathname)
    }

    return result
  }

  private async fileStatus(file: VirtualFile, snapshot: Snapshot): Promise<FileStatus> {
    if (await file.isExists()) {
      const hash = await file.hash('sha256')
      const local = snapshot.files[file.pathname]

      if (local == null) {
        return { pathname: file.pathname, type: 'created' }
      } else if (hash !== local.hash) {
        return { pathname: file.pathname, type: 'modified' }
      } else {
        return { pathname: file.pathname, type: 'unmodified' }
      }
    } else if (snapshot.files[file.pathname] != null) {
      return { pathname: file.pathname, type: 'deleted' }
    }

    // Special case, it does not exists on local and remote
    return { pathname: file.pathname, type: 'unmodified' }
  }

  async sync(): Promise<void> {}

  private async pull(): Promise<void> {
    
  }

  // TODO:
  // Validate current state - check if we're on the last remote snapshot
  // For now, we'll skip this validation and implement it later
  private async commit(snapshot?: Snapshot): Promise<string> {
    if (snapshot == null) {
      const head = this.vfs.getHeadFile()
      snapshot = await head.readJSON(EMPTY_SNAPSHOT)
    }

    const changes = await this.status(snapshot)
    const files: Record<string, SnapshotFile> = { ...snapshot.files }

    for (const change of changes) {
      const { pathname, type } = change

      if (type === 'unmodified') {
        continue
      }

      if (type === 'deleted') {
        delete files[pathname]
        continue
      }

      // else created || modified

      const file = this.vfs.file(pathname)
      const chunks: SnapshotFileChunk[] = []

      for await (const chunk of this.chunker.split(file)) {
        const hash = sha256(chunk)
        const chunkFile = this.vfs.getChunkFile(hash)

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

    snapshot = {
      hash: sha256(JSON.stringify(files)),
      timestamp: dayjs().unix(),
      files,
    }

    await this.vfs.getSnapshotFile(snapshot.hash).writeJSON(snapshot)
    await this.vfs.getHeadFile().writeText(snapshot.hash)

    await this.changes.writeJSON([])
    return snapshot.hash
  }

  private async push(): Promise<void> {}
}
