import { splitPathname } from '@arxhub/stdlib/fs/split-pathname'
import dedent from 'ts-dedent'
import type { VirtualFile, VirtualFileProps } from './file'
import type { VirtualFileSystem } from './system'

export type GenericFileOptions = {
  pathname: string
  fields: Record<string, unknown>
  type: string
  kind: string
}

export class GenericFile implements VirtualFile {
  readonly vfs: VirtualFileSystem

  readonly pathname: string
  readonly path: string
  readonly name: string
  readonly extension: string

  readonly fields: Record<string, unknown>
  readonly type: string
  readonly kind: string

  constructor(vfs: VirtualFileSystem, options: GenericFileOptions) {
    this.vfs = vfs

    this.pathname = options.pathname
    const splitted = splitPathname(options.pathname)
    this.path = splitted.path
    this.name = splitted.name
    this.extension = splitted.ext

    this.fields = options.fields
    this.type = options.type
    this.kind = options.kind
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
      type: ${this.type}
      kind: ${this.kind}
    `
  }

  props(): VirtualFileProps {
    return {
      pathname: this.pathname,
      path: this.path,
      name: this.name,
      extension: this.extension,
      fields: this.fields,
      type: this.type,
      kind: this.kind,
    }
  }
}
