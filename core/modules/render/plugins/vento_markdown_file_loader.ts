import { VirtualFile } from '~/core/modules/vfs/api'
import { Plugin } from '~/core/plugin'
import { RenderEngine } from '../render-engine.ts'
import { TemplateSource } from '~/core/modules/render/api'
import { dedent } from '@third-party/dedent'

export class VentoMarkdownFileLoaderPlugin implements Plugin<RenderEngine> {
  apply(target: RenderEngine): void {
    target.fileLoaders.push({
      test(file: VirtualFile): boolean {
        return file.extension === '.vtd'
      },

      async load(file: VirtualFile): Promise<TemplateSource> {
        const markdown = await file.text()
        const source = dedent`\
          {{ function __vento }}
            ${markdown}
          {{ /function }}

          {{ __vento() |> await __markdown }}
        `
        return {
          source: source,
        }
      },
    })
  }
}
