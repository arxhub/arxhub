import type { VirtualFile, VirtualFileSystem } from '@arxhub/vfs'
import AsyncLock from 'async-lock'
import { Repo } from './repo'
import type { ConflictResolver, Snapshot } from './types'
import type { FileStatus } from './types/file-status'

export class Local extends Repo {
  private readonly lock: AsyncLock
  private readonly changes: VirtualFile

  constructor(vfs: VirtualFileSystem) {
    super(vfs)
    this.lock = new AsyncLock()
    this.changes = vfs.file('/repo/changes.json')
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

  async commit(): Promise<Snapshot> {
    const status = await this.status()
  }
}
