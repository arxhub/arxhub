import { Plugin } from '~/core/plugin'
import { VirtualFile } from '~/core/modules/vfs/api'
import { RenderEngine } from '../render-engine.ts'
import { TemplateSource } from '~/core/modules/render/api'
import { html, tag } from '@third-party/html'

export class FallbackFileLoaderPlugin implements Plugin<RenderEngine> {
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
