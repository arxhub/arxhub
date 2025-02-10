import { FileRenderer, RenderMode, RenderOptions } from '~/core/modules/render/api'
import { VirtualFile } from '~/core/modules/vfs/api'
import vento from '@third-party/vento'

export class VentoRenderer implements FileRenderer {
  isSupported(file: VirtualFile, mode: RenderMode): boolean {
    if (mode !== 'static') return false

    return file.type === 'text/vento' || file.extension === 'vto'
  }

  async render(file: string | VirtualFile, options: RenderOptions): Promise<string> {
    const content = typeof file === 'string' ? file : await file.text()

    // For now we want to not to use cache between renders
    // One cache per one file render
    const env = vento()
    
    return (await env.runString(content, options.data)).content
  }
}
