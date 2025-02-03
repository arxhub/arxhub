import { VirtualFile } from './virtual-file.ts'

export abstract class VirtualFileSystem {
  protected constructor() {
  }

  public abstract isFileExists(pathname: string): Promise<boolean>

  public abstract findFileOrNull(pathname: string): Promise<VirtualFile | null>

  public abstract listFiles(): Promise<VirtualFile[]>

  public abstract readTextFile(pathname: string | VirtualFile): Promise<string>

  public abstract refresh(): Promise<void>
}
