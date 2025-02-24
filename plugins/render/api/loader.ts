import { VirtualFile } from '~/plugins/vfs/file.ts'
import { TemplateSource } from '~/plugins/render/api/template-source.ts'

export interface Loader {
  load(pathname: VirtualFile | string): Promise<TemplateSource>
  resolve(from: string, pathname: string): string
}
