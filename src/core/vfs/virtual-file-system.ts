import { VirtualFile } from './virtual-file.ts'

export abstract class VirtualFileSystem {
  protected constructor() {}

  abstract findDocumentOrNull(name: string): Promise<VirtualFile | null>

  abstract listDocuments(): Promise<VirtualFile[]>
}
