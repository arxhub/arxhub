import { VirtualFile } from '~/core/modules/vfs/api'
import { html, tag } from '@third-party/html'
import { FileRenderer } from '~/core/modules/render/api'

export class FallbackRenderer implements FileRenderer {
  readonly priority = Number.MIN_SAFE_INTEGER

  isSupported(_file: VirtualFile): boolean {
    return true
  }

  async render(file: VirtualFile): Promise<string> {
    return html(
      tag('p', [
        'Fallback renderer',
        tag('br'),
        `pathname: "${file.pathname}"`,
        tag('br'),
        `kind: "${file.kind}", type: "${file.type}"`,
      ]),
    )
  }
}
