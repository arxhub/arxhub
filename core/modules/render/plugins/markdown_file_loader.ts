import { VirtualFile } from '~/core/modules/vfs/api'
import { marked } from '@third-party/marked'
import { Plugin } from '~/core/plugin'
import { RenderEngine } from '../render-engine.ts'
import { TemplateSource } from '~/core/modules/render/api'
import { dedent } from '@third-party/dedent'

export class MarkdownFileLoaderPlugin implements Plugin<RenderEngine> {
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
