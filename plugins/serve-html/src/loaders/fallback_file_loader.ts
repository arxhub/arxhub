import type { Plugin } from '~/core/plugin.ts'
import type { RenderEngine } from '../render_engine.ts'
import type { TemplateSource } from '~/plugins/serve/html/api/template_source.ts'
import { html, tag } from '@third-party/html'
import type { VirtualFile } from '~/plugins/vfs/file.ts'

export class FallbackFileLoaderPlugin implements Plugin<RenderEngine> {
  readonly name = FallbackFileLoaderPlugin.name

  apply(target: RenderEngine): void {
    target.fileLoaders.push({
      test(_file: VirtualFile): boolean {
        return true
      },

      load(file: VirtualFile): Promise<TemplateSource> {
        const source = html(
          tag('p', [
            'Fallback file loader',
            tag('br'),
            `location: "${file.location}"`,
            tag('br'),
            `kind: "${file.kind}", type: "${file.type}"`,
          ]),
        )

        return Promise.resolve({
          source: source,
          data: {},
        })
      },
    })
  }
}
