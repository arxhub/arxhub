import type { TemplateSource } from './template_source.ts'
import type { VirtualFile } from '~/plugins/vfs/file.ts'

export interface FileLoader {
  test(file: VirtualFile): boolean
  load(file: VirtualFile): Promise<TemplateSource>
}
