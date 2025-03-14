import { IllegalStateError } from '@arxhub/stdlib/errors'
import type { VirtualFile } from './file'
import { FileNotFound } from './file-not-found'
import type { VirtualFileSystem } from './system'

export abstract class AbstractVirtualFileSystem implements VirtualFileSystem {
  abstract readonly name: string

  isFileExists(location: string): Promise<boolean> {
    return this._isFileExists(this.resolveFilename(location))
  }

  async file(location: string): Promise<VirtualFile> {
    const pathname = this.resolveFilename(location)
    const file = await this._fileOrNull(pathname)
    if (file == null) throw new FileNotFound(`location: ${location}`)
    return file
  }

  fileOrNull(location: string): Promise<VirtualFile | null> {
    return this._fileOrNull(this.resolveFilename(location))
  }

  readTextFile(location: string | VirtualFile): Promise<string> {
    // biome-ignore lint/style/noParameterAssign: Unwrap location from VirtualFile
    location = typeof location === 'string' ? location : location.location
    return this._readTextFile(this.resolveFilename(location))
  }

  abstract _isFileExists(pathname: string): Promise<boolean>

  abstract _fileOrNull(pathname: string): Promise<VirtualFile | null>

  abstract _readTextFile(pathname: string): Promise<string>

  abstract listFiles(): Promise<VirtualFile[]>

  abstract refresh(): Promise<void>

  protected resolveFilename(location: string): string {
    const [prefix, ...parts] = location.split(':')
    if (prefix !== this.name) throw new IllegalStateError(`Expected "${this.name}" prefix, got "${prefix}"`)
    return parts.join(':')
  }
}
