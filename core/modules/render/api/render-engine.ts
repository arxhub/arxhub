import { VirtualFile } from '~/core/modules/vfs/api'
import { RenderOptions } from './render-options.ts'

export interface RenderEngine {
  render(file: VirtualFile, options: RenderOptions): Promise<string>
}
