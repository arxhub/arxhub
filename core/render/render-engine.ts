import { VirtualFile } from '~/core/vfs'
import { FileRenderer } from './file-renderer.ts'
import { ErrorFactory } from '~/core/error'

export class RenderEngine {
  private readonly registry: FileRenderer[]

  public constructor() {
    this.registry = []
  }

  public render(file: VirtualFile): Promise<string> {
    const renderer = this.getFileRenderer(file)
    return renderer.render(file)
  }

  public registerFileRenderer(renderer: FileRenderer): void {
    this.registry.push(renderer)
    this.registry.sort((a, b) => a.priority - b.priority)
  }

  private getFileRenderer(file: VirtualFile): FileRenderer {
    const renderer = this.registry.find((renderer) => renderer.isSupported(file))
    if (renderer == null) throw ErrorFactory.FileRendererNotFound(file)
    return renderer
  }
}

