import { splitPathname } from '@arxhub/stdlib/fs/split-pathname'
import type { VirtualFile, VirtualFileProps } from './virtual-file'
import type { VirtualFileSystem } from './virtual-file-system'

export type GenericFileOptions = Omit<VirtualFileProps, 'name' | 'path' | 'extension'>

export class GenericFile implements VirtualFile {
  readonly vfs: VirtualFileSystem

  readonly id: string
  readonly version: number

  readonly pathname: string
  readonly path: string
  readonly name: string
  readonly extension: string

  readonly fields: Record<string, unknown>
  readonly metadata: Record<string, unknown>
  readonly contentType: string
  readonly moduleType: string

  constructor(vfs: VirtualFileSystem, options: GenericFileOptions) {
    this.vfs = vfs

    this.id = options.id
    this.version = options.version

    this.pathname = options.pathname
    const splitted = splitPathname(options.pathname)
    this.path = splitted.path
    this.name = splitted.name
    this.extension = splitted.ext

    this.fields = options.fields
    this.metadata = options.metadata
    this.contentType = options.contentType
    this.moduleType = options.moduleType
  }

  read(): Promise<Buffer> {
    return this.vfs.readFile(this.pathname)
  }
  readText(): Promise<string> {
  }
  readJSON<T>(): Promise<T> {
  }
  readable(): Promise<ReadableStream<Uint8Array>> {
    return this.vfs.getFileReadable(this.pathname)
  }

  // --- --- ---

  write(content: Buffer): Promise<void> {
    return this.vfs.writeFile(this.pathname, content)
  }
  writeText(content: string): Promise<void> {
  }
  writeJSON<T>(content: T): Promise<void> {
  }
  writable(): Promise<WritableStream<Uint8Array>> {
    return this.vfs.getFileWritable(this.pathname)
  }

  // --- --- ---

  delete(): Promise<void> {
    return this.vfs.deleteFile(this.pathname)
  }

  // --- --- ---

  isExists(): Promise<boolean> {
    return this.vfs.isFileExists(this.pathname)
  }

  // --- --- ---

  hash(): Promise<string> {
    return this.vfs.getFileHash(this.pathname, 'sha256')
  }
}
