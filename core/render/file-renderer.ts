import { VirtualFile } from '~/core/vfs'

export interface FileRenderer {
  readonly priority: number

  isSupported(file: VirtualFile): boolean
  render(file: VirtualFile): Promise<string>
}
