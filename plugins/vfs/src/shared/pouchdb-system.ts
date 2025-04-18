import PouchDB from '@arxhub/plugin-pouchdb/pouchdb'
import type { VirtualFile } from './file'
import type { SearchableFileSystem } from './searchable-system'
import type { VirtualFileSystem } from './system'

export class PouchDBFileSystem implements SearchableFileSystem {
  private readonly index: PouchDB.Database
  private readonly actual: VirtualFileSystem

  constructor(actual: VirtualFileSystem) {
    this.index = new PouchDB('vfs', { adapter: 'memory' })
    this.actual = actual
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
