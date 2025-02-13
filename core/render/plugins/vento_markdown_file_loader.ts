import { Plugin } from '~/core/plugin'
import { dedent } from '@third-party/dedent'
import { RenderEngine } from '~/core/render'
import { VirtualFile } from '~/core/vfs/api'
import { TemplateSource } from '~/core/render/api'

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
