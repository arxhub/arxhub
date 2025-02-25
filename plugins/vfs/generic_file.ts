import { splitPathname } from '~/stdlib/split_pathname.ts'
import { VirtualFile } from '~/plugins/vfs/file.ts'
import { LocalFileSystem } from '~/plugins/vfs/local_system.ts'
import { dedent } from '@third-party/dedent'

export type VirtualFileOptions = {
  pathname: string
  fields: Record<string, unknown>
  type: string
  kind: string
}

export class GenericFile implements VirtualFile {
  readonly vfs: LocalFileSystem

  readonly location: string
  readonly pathname: string
  readonly path: string
  readonly name: string
  readonly extension: string

  readonly fields: Record<string, unknown>
  readonly type: string
  readonly kind: string

  constructor(vfs: LocalFileSystem, options: VirtualFileOptions) {
    this.vfs = vfs

    this.location = `${vfs.name}:${options.pathname}`
    this.pathname = options.pathname
    const splitted = splitPathname(options.pathname)
    this.path = splitted.path
    this.name = splitted.name
    this.extension = splitted.ext

    this.fields = options.fields
    this.type = options.type
    this.kind = options.kind
  }

  text(): Promise<string> {
    return this.vfs.readTextFile(this)
  }

  stat(): string {
    return dedent`
      location: ${this.location}
      pathname: ${this.pathname}
      extension: ${this.extension}
      type: ${this.type}
      kind: ${this.kind}
    `
  }
}
