import PouchDB from '@arxhub/plugin-pouchdb/pouchdb'
import AsyncLock from 'async-lock'
import type { VirtualFile } from './file'
import type { SearchableFileSystem } from './searchable-system'
import type { VirtualFileSystem } from './system'

export class PouchDBFileSystem implements SearchableFileSystem {
  private readonly actual: VirtualFileSystem
  private index: PouchDB.Database | null
  private lock: AsyncLock

  constructor(actual: VirtualFileSystem) {
    this.actual = actual
    this.index = null
    this.lock = new AsyncLock()
  }

  private async getIndex(rebuild = false): Promise<PouchDB.Database> {
    if (!rebuild && !this.lock.isBusy() && this.index != null) return this.index

    this.index = await this.lock.acquire('index', async () => {
      const newIndex = this.index == null
      const index = this.index ?? new PouchDB('vfs', { adapter: 'memory' })

      if (newIndex || rebuild) {
        // TODO
      }

      return index
    })

    return this.index
  }

  isFileExists(pathname: string): Promise<boolean> {
    return this.actual.isFileExists(pathname)
  }

  file(pathname: string): Promise<VirtualFile> {
    return this.actual.file(pathname)
  }

  fileOrNull(pathname: string): Promise<VirtualFile | null> {
    return this.actual.fileOrNull(pathname)
  }

  listFiles(): AsyncGenerator<VirtualFile> {
    return this.actual.listFiles()
  }

  readTextFile(pathname: string): Promise<string> {
    return this.actual.readTextFile(pathname)
  }

  writeTextFile(pathname: string, content: string): Promise<void> {
    return this.actual.writeTextFile(pathname, content)
  }

  refresh(): Promise<void> {
    return this.actual.refresh()
  }
}
