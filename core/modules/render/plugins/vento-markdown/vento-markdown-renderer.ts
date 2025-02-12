import { FileRenderer, RenderMode, RenderOptions } from '~/core/modules/render/api'
import { VirtualFile } from '~/core/modules/vfs/api'
import { MarkdownRenderer } from '../markdown/markdown-renderer.ts'
import { VentoRenderer } from '../vento/vento-renderer.ts'

export class VentoMarkdownRenderer implements FileRenderer {
  readonly priority = 64

  constructor(
    private readonly vento: VentoRenderer,
    private readonly markdown: MarkdownRenderer,
  ) {}

  isSupported(file: VirtualFile, mode: RenderMode): boolean {
    return this.vento.isSupported(file, mode) || this.markdown.isSupported(file, mode)
  }

  async render(file: string | VirtualFile, options: RenderOptions): Promise<string> {
    const content = typeof file === 'string' ? file : await file.text()

    return await this.markdown.render(
      await this.vento.render(content, options),
      options,
    )
  }
}
