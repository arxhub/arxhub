import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import type { VirtualFile, VirtualFileSystem } from '@arxhub/vfs'
import AsyncLock from 'async-lock'
import dayjs from 'dayjs'
import { Chunker } from './chunker'
import { Repo } from './repo'
import type { Snapshot, SnapshotFile, SnapshotFileChunk } from './types'
import type { FileStatus } from './types/file-status'

export class Local extends Repo {
  private readonly lock: AsyncLock
  private readonly changes: VirtualFile
  private readonly chunker: Chunker

  constructor(vfs: VirtualFileSystem) {
    super(vfs)
    this.lock = new AsyncLock()
    this.changes = vfs.file('/repo/changes.json')
    this.chunker = new Chunker()
  }

  add(path: string): Promise<void> {
    return this.lock.acquire('path', async () => {
      const paths = await this.changes.readJSON<string[]>([])
      paths.push(path)
      await this.changes.writeJSON(paths)
    })
  }

  // TODO: Maybe convert to async iterator
  async status(): Promise<FileStatus[]> {
    const head = await this.head()
    const result: FileStatus[] = []
    const processed = new Set<string>()

    for (const path in head.files) {
      const file = this.vfs.file(path)
      const status = await this.fileStatus(file, head)
      result.push(status)
      processed.add(file.pathname)
    }

    const paths = await this.changes.readJSON([])

    for (const path of paths) {
      const pathname = `/data/${path}`
      if (processed.has(pathname)) continue

      const file = this.vfs.file(pathname)
      const status = await this.fileStatus(file, head)
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

  private async pull(): Promise<void> {}

  private async commit(allowConflicts: boolean = false): Promise<string> {
    // Validate current state - check if we're on the last remote snapshot
    // For now, we'll skip this validation and implement it later

    const changes = await this.status()
    const head = await this.head()

    const files: Record<string, SnapshotFile> = { ...head.files }

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
      const chunkHashes: string[] = []

      for await (const chunk of this.chunker.split(file)) {
        const chunkHash = sha256(chunk)
        const chunkPathname = `/repo/chunks/${chunkHash}`
        const chunkFile = this.vfs.file(chunkPathname)

        if (!(await chunkFile.isExists())) {
          await chunkFile.write(Buffer.from(chunk))
        }

        chunks.push({
          hash: chunkHash,
          pathname: chunkPathname,
        })

        chunkHashes.push(chunkHash)
      }

      const fileHash = await file.hash('sha256')

      files[pathname] = {
        hash: fileHash,
        pathname: pathname,
        chunks,
      }
    }

    const snapshot: Snapshot = {
      hash: sha256(JSON.stringify(files)),
      pathname: '/repo/head',
      timestamp: dayjs().unix(),
      files,
    }

    const snapshotFile = this.vfs.file(`/repo/snapshots/${snapshot.hash}`)
    await snapshotFile.writeJSON(snapshot)
    await this.updateHead(snapshot.hash)

    await this.changes.writeJSON([])
    return snapshot.hash
  }

  private async push(): Promise<void> {}
}
