export abstract class VirtualFile {
  protected constructor() {
  }

  public abstract readonly pathname: string
  public abstract readonly path: string
  public abstract readonly name: string
  public abstract readonly ext: string

  public abstract readonly size: number
  public abstract readonly type: string

  public abstract readonly fields: Record<string, string | number | boolean>
  public abstract readonly metadata: Record<string, string | number | boolean>

  public abstract stream(): ReadableStream<Uint8Array>
  public abstract text(): Promise<string>
}
