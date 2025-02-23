import { VirtualFile } from './file.ts'

export abstract class VirtualFileSystem {
  protected constructor() {
  }

  public abstract readonly name: string

  public abstract isFileExists(pathname: string): Promise<boolean>

  abstract file(pathname: string): Promise<VirtualFile>

  public abstract fileOrNull(pathname: string): Promise<VirtualFile | null>

  public abstract listFiles(): Promise<VirtualFile[]>

  public abstract readTextFile(pathname: string | VirtualFile): Promise<string>

  public abstract refresh(): Promise<void>
}
