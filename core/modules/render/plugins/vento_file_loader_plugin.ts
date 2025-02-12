import { Plugin } from '../../../plugin/mod.ts'
import { VirtualFile } from '~/core/modules/vfs/api'
import { RenderEngine } from '../render-engine.ts'
import { TemplateSource } from '~/core/modules/render/api'

export class VentoFileLoaderPlugin implements Plugin<RenderEngine> {
  apply(target: RenderEngine): void {
    target.fileLoaders.push({
      test(file: VirtualFile): boolean {
        return file.extension === '.vto' || file.extension === '.vento'
      },
      async load(file: VirtualFile): Promise<TemplateSource> {
        return {
          source: await file.text(),
          data: {},
        }
      },
    })
  }
}
