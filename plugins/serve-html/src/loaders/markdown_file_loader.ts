import { marked } from '@third-party/marked'
import { Plugin } from '~/core/plugin.ts'
import { dedent } from '@third-party/dedent'
import { RenderEngine } from '../render_engine.ts'
import { VirtualFile } from '~/plugins/vfs/file.ts'
import { TemplateSource } from '~/plugins/serve/html/api/template_source.ts'

export class MarkdownFileLoaderPlugin implements Plugin<RenderEngine> {
  readonly name = MarkdownFileLoaderPlugin.name

  apply(target: RenderEngine): void {
    target.filters['__markdown'] = (content: string) => {
      return marked.parse(content, { async: true })
    }

    target.fileLoaders.push({
      test(file: VirtualFile): boolean {
        return file.extension === '.md'
      },

      async load(file: VirtualFile): Promise<TemplateSource> {
        const markdown = await file.text()
        const source = dedent`\
          {{ echo |> await __markdown }}
            ${markdown}
          {{ /echo }}
        `
        return {
          source: source,
        }
      },
    })
  }
}
