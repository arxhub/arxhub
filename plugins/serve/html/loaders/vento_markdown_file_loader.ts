import { Plugin } from '~/core/plugin.ts'
import { dedent } from '@third-party/dedent'
import { RenderEngine } from '~/plugins/serve/html/render_engine.ts'
import { VirtualFile } from '~/plugins/vfs/file.ts'
import { TemplateSource } from '~/plugins/serve/html/api/template_source.ts'

export class VentoMarkdownFileLoaderPlugin implements Plugin<RenderEngine> {
  readonly name = VentoMarkdownFileLoaderPlugin.name

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
