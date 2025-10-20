import type { VirtualFile } from '@arxhub/vfs'
import { Repo } from './repo'
import type { ConflictResolver, Snapshot } from './types'
import type { FileStatus } from './types/file-status'

export class Local extends Repo {
  async add(path: string): Promise<void> {
    const changes = await this.vfs.file(`/repo/changes`, { create: true })
    await changes.appendText(`${path}\n`)
  }

  async status(): Promise<FileStatus[]> {
    const head = await this.head()
    const result: FileStatus[] = []
    const processed = new Set<string>()

    // Collect statuses for already tracked files
    for (const path in head.files) {
      const file = await this.vfs.file(path)
      const status = await this.fileStatus(file, head)
      result.push(status)
      processed.add(file.pathname)
    }

    // Collect statuses for added files
    const changesFile = await this.vfs.file(`/repo/changes`, { create: true })
    const changesFileText = await changesFile.readText()
    const changes = changesFileText.split('\n').filter(Boolean)

    for (const change of changes) {
      const pathname = `/data/${change}`
      if (processed.has(pathname)) continue

      const file = await this.vfs.file(pathname)
      if (await file.isDirectory()) {
        for await (const child of this.vfs.listFiles(pathname, { recursive: true })) {
          if (processed.has(child.pathname)) continue
          const status = await this.fileStatus(child, head)
          result.push(status)
          processed.add(child.pathname)
        }
      } else {
        const status = await this.fileStatus(file, head)
        result.push(status)
        processed.add(file.pathname)
      }
    }

    return result
  }

  private async fileStatus(file: VirtualFile, head: Snapshot): Promise<FileStatus> {
    if (await file.isExists()) {
      const hash = await file.sha256()
      const local = head.files[file.pathname]

      if (local == null) {
        return { pathname: file.pathname, type: 'created' }
      } else if (hash !== local.hash) {
        return { pathname: file.pathname, type: 'modified' }
      } else {
        return { pathname: file.pathname, type: 'unmodified' }
      }
    } else if (head.files[file.pathname] != null) {
      return { pathname: file.pathname, type: 'deleted' }
    }

    // Special case, it does not exists on local and remote
    return { pathname: file.pathname, type: 'unmodified' }
  }

  async unpack(hash: string, resolver: ConflictResolver): Promise<void> {}

  async pack(hash: string): Promise<void> {}
}
