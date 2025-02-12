import { LocalFileSystem } from './local-file-system.ts'
import { splitPathname } from '../../utils/split-pathname.ts'
import { VirtualFile } from '../api/virtual-file.ts'
import { VirtualFileOptions } from '~/core/modules/vfs/api'

export class LocalFile extends VirtualFile {
  public override readonly vfs: LocalFileSystem

  public override readonly location: string
  public override readonly pathname: string
  public override readonly path: string
  public override readonly name: string
  public override readonly extension: string

  public override readonly fields: Record<string, unknown>
  public override readonly type: string
  public override readonly kind: string

  public constructor(vfs: LocalFileSystem, options: VirtualFileOptions) {
    super()
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

  public override text(): Promise<string> {
    return this.vfs.readTextFile(this)
  }
}
