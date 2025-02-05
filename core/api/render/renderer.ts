import { VirtualFile } from '../vfs/mod.ts'

export interface Renderer {
  readonly priority: number

  isSupported(file: VirtualFile): boolean
  render(file: VirtualFile): Promise<string>
}
