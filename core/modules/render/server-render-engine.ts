import { VirtualFile } from '~/core/modules/vfs/api'
import { RenderEngine, RenderOptions } from '~/core/modules/render/api'

export class ServerRenderEngine implements RenderEngine {
  render(file: VirtualFile, options: RenderOptions): Promise<string> {
    throw new Error('Method not implemented.')
  }
}
