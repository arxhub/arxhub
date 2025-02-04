import { VirtualFile } from '~/core/vfs'
import { LocalFileSystem } from './local-file-system.ts'
import { splitPathname } from '~/core/stdlib/utils/split-pathname.ts'

export class LocalFile extends VirtualFile {
  public override readonly pathname: string
  public override readonly path: string
  public override readonly name: string
  public override readonly extension: string
  public override readonly type: string
  public override readonly kind: string

  private readonly vfs: LocalFileSystem

  public constructor(pathname: string, vfs: LocalFileSystem) {
    super()
    this.pathname = pathname
    this.vfs = vfs

    const splitted = splitPathname(pathname)
    this.path = splitted.path
    this.name = splitted.name
    this.extension = splitted.ext

    this.type = 'text/plain'
    this.kind = 'document'
  }

  public override text(): Promise<string> {
    return this.vfs.readTextFile(this)
  }
}
