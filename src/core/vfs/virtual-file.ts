export abstract class VirtualFile {
  protected constructor() {
  }

  public abstract readonly pathname: string
  public abstract readonly path: string
  public abstract readonly name: string
  public abstract readonly ext: string

  public abstract text(): Promise<string>
}
