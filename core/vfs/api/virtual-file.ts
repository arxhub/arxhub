import { VirtualFileSystem } from './mod.ts'

export abstract class VirtualFile {
  protected constructor() {
  }

  public abstract readonly vfs: VirtualFileSystem
  public abstract readonly pathname: string
  public abstract readonly path: string
  public abstract readonly name: string
  public abstract readonly extension: string
  public abstract readonly type: string
  public abstract readonly kind: string

  public abstract text(): Promise<string>
}
