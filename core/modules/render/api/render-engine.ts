import { VirtualFile } from '../../../vfs/api/virtual-file.ts'
import { RenderOptions } from './render-options.ts'

export interface RenderEngine {
  render(file: VirtualFile, options: RenderOptions): Promise<string>
}
