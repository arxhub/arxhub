import type { MangoQuery } from './mango'
import type { VirtualFile, VirtualFileProps } from './virtual-file'
import type { VirtualFileSystem } from './virtual-file-system'

export interface SearchableFileSystem<T extends VirtualFileProps = VirtualFileProps> extends VirtualFileSystem {
  find(query: MangoQuery.FindRequest<T>): Promise<VirtualFile[]>
}
