import { splitPathname } from '@arxhub/stdlib/fs/split-pathname'
import dedent from 'ts-dedent'
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
    throw new Error('Method not implemented.')
  }

  write(content: Buffer): Promise<Buffer> {
    throw new Error('Method not implemented.')
  }

  readText(): Promise<string> {
    return this.vfs.readTextFile(this.pathname)
  }

  writeText(content: string): Promise<void> {
    return this.vfs.writeTextFile(this.pathname, content)
  }

  stat(): string {
    return dedent`
      pathname: ${this.pathname}
      extension: ${this.extension}
      contentType: ${this.contentType}
      moduleType: ${this.moduleType}
    `
  }

  props(): VirtualFileProps {
    return {
      id: this.id,
      version: this.version,
      pathname: this.pathname,
      path: this.path,
      name: this.name,
      extension: this.extension,
      fields: this.fields,
      metadata: this.metadata,
      contentType: this.contentType,
      moduleType: this.moduleType,
    }
  }
}
