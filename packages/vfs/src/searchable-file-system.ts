import type { MangoQuery } from './mango-query'
import type { VirtualFile, VirtualFileProps } from './virtual-file'
import type { VirtualFileSystem } from './virtual-file-system'

export interface SearchableFileSystem extends VirtualFileSystem {
  query(selector: MangoQuery.Selector<VirtualFileProps>): Promise<VirtualFile[]>
}
