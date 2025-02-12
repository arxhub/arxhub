import { VirtualFile } from '~/core/modules/vfs/api'
import { TemplateSource } from './template-source.ts'

export interface Loader {
  load(pathname: VirtualFile | string): Promise<TemplateSource>
  resolve(from: string, pathname: string): string
}
