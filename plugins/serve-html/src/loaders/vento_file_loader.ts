import type { Plugin } from '~/core/plugin.ts'
import type { VirtualFile } from '~/plugins/vfs/file.ts'
import type { RenderEngine } from '~/plugins/serve/html/render_engine.ts'
import type { TemplateSource } from '~/plugins/serve/html/api/template_source.ts'

export class VentoFileLoaderPlugin implements Plugin<RenderEngine> {
  readonly name = VentoFileLoaderPlugin.name

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
