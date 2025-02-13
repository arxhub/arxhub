export class BaseLocalFile extends VirtualFile {
  public override readonly vfs: LocalFileSystem

  public override readonly pathname: string
  public override readonly path: string
  public override readonly name: string
  public override readonly extension: string
  public override readonly type: string
  public override readonly kind: string

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
