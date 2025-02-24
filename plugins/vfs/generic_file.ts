import { splitPathname } from '~/stdlib/split_pathname.ts'
import { VirtualFile } from '~/plugins/vfs/file.ts'
import { LocalFileSystem } from "~/plugins/vfs/local_file_system.ts"

export type VirtualFileOptions = {
  pathname: string
  fields: Record<string, unknown>
  type: string
  kind: string
}

export class GenericFile implements VirtualFile {
  public readonly vfs: LocalFileSystem

  public readonly location: string
  public readonly pathname: string
  public readonly path: string
  public readonly name: string
  public readonly extension: string

  public readonly fields: Record<string, unknown>
  public readonly type: string
  public readonly kind: string

  public constructor(vfs: LocalFileSystem, options: VirtualFileOptions) {
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

  public text(): Promise<string> {
    return this.vfs.readTextFile(this)
  }
}
