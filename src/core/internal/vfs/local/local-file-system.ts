import { VirtualFile, VirtualFileSystem } from '~/core/vfs'
import { LocalFile } from './local-file.ts'

export class LocalFileSystem extends VirtualFileSystem {
  private readonly rootDir: string

  public constructor(rootDir: string) {
    super()
    this.rootDir = rootDir
  }

  public override async isFileExists(pathname: string): Promise<boolean> {
    try {
      await Deno.lstat(`${this.rootDir}/${pathname}`)
      return true
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) throw err
      return false
    }
  }

  public override async findFileOrNull(pathname: string): Promise<VirtualFile | null> {
    if (!(await this.isFileExists(pathname))) return null
    return new LocalFile(pathname, this)
  }

  public override listFiles(): Promise<VirtualFile[]> {
    throw new Error('Method not implemented.')
  }

  public override readTextFile(pathname: string | VirtualFile): Promise<string> {
    if (pathname instanceof VirtualFile) pathname = pathname.pathname
    return Deno.readTextFile(`${this.rootDir}/${pathname}`)
  }
}
