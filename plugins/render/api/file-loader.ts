import { TemplateSource } from '~/plugins/render/api/template-source.ts'
import { VirtualFile } from '~/plugins/vfs/file.ts'

export interface FileLoader {
  test(file: VirtualFile): boolean
  load(file: VirtualFile): Promise<TemplateSource>
}
