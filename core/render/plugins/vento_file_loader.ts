import { Plugin } from '~/core/plugin'
import { VirtualFile } from '~/core/vfs/api'
import { RenderEngine } from '~/core/render'
import { TemplateSource } from '~/core/render/api'

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
