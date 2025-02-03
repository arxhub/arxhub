import { VirtualFile } from "~/core/vfs"
import { splitPathname } from '~/core/internal/utils/split-pathname.ts'
import { LocalFileSystem } from './local-file-system.ts'

export class LocalFile extends VirtualFile {
  public override readonly pathname: string
  public override readonly path: string
  public override readonly name: string
  public override readonly ext: string

  private readonly vfs: LocalFileSystem

  public constructor(pathname: string, vfs: LocalFileSystem) {
    super()
    this.pathname = pathname
    this.vfs = vfs

    const splitted = splitPathname(pathname)
    this.path = splitted.path
    this.name = splitted.name
    this.ext = splitted.ext
  }

  public override text(): Promise<string> {
    return this.vfs.readTextFile(this)
  }
}
