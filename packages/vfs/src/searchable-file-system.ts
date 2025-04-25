import type { Mango } from './mango'
import type { VirtualFile, VirtualFileProps } from './virtual-file'
import type { VirtualFileSystem } from './virtual-file-system'

export interface SearchableFileSystem extends VirtualFileSystem {
  select<T extends VirtualFileProps>(query: Mango.SelectQuery<T>): Promise<VirtualFile[]>
}
