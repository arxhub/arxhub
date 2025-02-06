import { VirtualFile } from '../../api/vfs/mod.ts'
import { Renderer } from '../api/renderer.ts'
import { ErrorFactory } from '~/core/error'

export class RenderEngine {
  private readonly renderers: Renderer[]

  public constructor(renderers: Renderer[]) {
    this.renderers = renderers
  }

  public render(file: VirtualFile): Promise<string> {
    const renderer = this.getRenderer(file)
    return renderer.render(file)
  }

  private getRenderer(file: VirtualFile): Renderer {
    const renderer = this.renderers.find((renderer) => renderer.isSupported(file))
    if (renderer == null) throw ErrorFactory.FileRendererNotFound(file)
    return renderer
  }
}
