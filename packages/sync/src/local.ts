import type { VirtualFile } from '@arxhub/vfs'
import type { Snapshot } from 'src/types'
import { Repo } from './repo'
import type { FileStatus } from './types/file-status'

export class Local extends Repo {
  async add(path: string): Promise<void> {
    const changes = await this.vfs.file(`./repo/changes`, { create: true })
    await changes.appendText(`${path}\n`)
  }

  async status(): Promise<FileStatus[]> {
    const head = await this.head()
    const result: FileStatus[] = []
    const processedPaths = new Set<string>()

    const changesFile = await this.vfs.file(`./repo/changes`, { create: true })
    const changesFileText = await changesFile.readText()
    const changes = changesFileText.split('\n').filter(Boolean)

    for (const change of changes) {
      const path = `./data/${change}`
      const file = await this.vfs.file(path)
      if (await file.isDirectory()) {
        for await (const subFile of this.vfs.listFiles(path, { recursive: true })) {
          const status = await this.fileStatus(subFile, head)
          result.push(status)
          processedPaths.add(subFile.path)
        }
      } else {
        const status = await this.fileStatus(file, head)
        result.push(status)
        processedPaths.add(file.path)
      }
    }

    // Check for deleted files
    for (const path in head.files) {
      if (!processedPaths.has(path) && !(await this.vfs.exists(path))) {
        result.push({ pathname: path, type: 'deleted' })
      }
    }

    return result
  }

  private async fileStatus(file: VirtualFile, head: Snapshot): Promise<FileStatus> {
    const exists = await file.isExists()

    if (exists) {
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
}
