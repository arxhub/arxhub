import { Plugin } from '~/core/modules/plugin/api'
import { VirtualFile } from '../../../vfs/api/virtual-file.ts'

export * from './file-renderer.ts'
export * from './render-engine.ts'
export * from './render-mode.ts'
export * from './render-options.ts'

interface RenderEngineFileLoader {
  test(file: VirtualFile): boolean
  load(file: VirtualFile): Promise<string>
}

class RenderEngine {
  readonly loaders: RenderEngineFileLoader[]

  constructor() {
    this.loaders = []
  }

  use(plugin: Plugin<RenderEngine>): void {
    plugin.apply(this)
  }
}
