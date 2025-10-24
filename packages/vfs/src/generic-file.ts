import { splitPathname } from '@arxhub/stdlib/fs/split-pathname'
import type { DeleteOptions } from './types/delete-options'
import type { VirtualFile } from './virtual-file'
import type { VirtualFileSystem } from './virtual-file-system'

export class GenericFile implements VirtualFile {
  readonly vfs: VirtualFileSystem

  readonly pathname: string
  readonly path: string
  readonly name: string
  readonly extension: string

  constructor(vfs: VirtualFileSystem, pathname: string) {
    this.vfs = vfs

    this.pathname = pathname
    const splitted = splitPathname(pathname)
    this.path = splitted.path
    this.name = splitted.name
    this.extension = splitted.ext
  }

  read(): Promise<Buffer> {
    return this.vfs.read(this.pathname)
  }

  async readText(): Promise<string> {
    const buffer = await this.read()
    return buffer.toString('utf-8')
  }

  async readJSON<T>(defaultValue?: T): Promise<T> {
    if (defaultValue != null && !(await this.isExists())) {
      return defaultValue
    }

    const text = await this.readText()
    return JSON.parse(text) as T
  }

  readable(): Promise<ReadableStream<Uint8Array>> {
    return this.vfs.readableStream(this.pathname)
  }

  write(content: Buffer): Promise<void> {
    return this.vfs.write(this.pathname, content)
  }

  writeText(content: string): Promise<void> {
    return this.write(Buffer.from(content, 'utf-8'))
  }

  writeJSON<T>(content: T): Promise<void> {
    const json = JSON.stringify(content, null, 2)
    return this.writeText(json)
  }

  writable(): Promise<WritableStream<Uint8Array>> {
    return this.vfs.writableStream(this.pathname)
  }

  delete(options?: DeleteOptions): Promise<void> {
    return this.vfs.delete(this.pathname, options)
  }

  isExists(): Promise<boolean> {
    return this.vfs.isExists(this.pathname)
  }

  hash(algorithm: string): Promise<string> {
    return this.vfs.hash(this.pathname, algorithm)
  }

  head(): Promise<unknown> {
    return this.vfs.head(this.pathname)
  }
}
