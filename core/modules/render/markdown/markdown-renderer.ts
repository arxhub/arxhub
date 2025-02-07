import { FileRenderer, RenderMode, RenderOptions } from '~/core/modules/render/api'
import { VirtualFile } from '~/core/modules/vfs/api'
import { marked } from '@third-party/marked'

export class MarkdownRenderer implements FileRenderer {
  isSupported(file: VirtualFile, mode: RenderMode): boolean {
    if (mode !== 'static') return false

    return file.type === 'text/markdown' || file.extension === 'md'
  }

  async render(file: string | VirtualFile, _options: RenderOptions): Promise<string> {
    const content = typeof file === 'string' ? file : await file.text()
    return await marked.parse(content, { async: true })
  }
}
