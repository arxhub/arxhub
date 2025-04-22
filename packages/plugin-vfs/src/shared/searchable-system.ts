import type { VirtualFile } from './file'
import type { GenericFileOptions } from './generic-file'
import type { VirtualFileSystem } from './system'

export interface SearchableFileSystem<T extends GenericFileOptions = GenericFileOptions> extends VirtualFileSystem {
  // TODO: Pass selector, limit, skip, sort, also add type-safity
  find(request: PouchDB.Find.FindRequest<T>): Promise<VirtualFile[]>
}
