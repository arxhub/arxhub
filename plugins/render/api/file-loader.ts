import { VirtualFile } from '~/core/vfs/api'
import { TemplateSource } from './template-source.ts'

export interface FileLoader {
  test(file: VirtualFile): boolean
  load(file: VirtualFile): Promise<TemplateSource>
}
