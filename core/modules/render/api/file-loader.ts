import { VirtualFile } from '~/core/modules/vfs/api'
import { TemplateSource } from './template-source.ts'

export interface FileLoader {
  test(file: VirtualFile): boolean
  load(file: VirtualFile): Promise<TemplateSource>
}
