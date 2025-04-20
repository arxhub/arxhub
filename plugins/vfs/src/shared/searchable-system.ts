import type { VirtualFile } from './file'
import type { GenericFileOptions } from './generic-file'
import type { VirtualFileSystem } from './system'

export interface SearchableFileSystem<T extends GenericFileOptions = GenericFileOptions> extends VirtualFileSystem {
  find(request: PouchDB.Find.FindRequest<T>): Promise<VirtualFile[]>
}
