import type { VirtualFile } from './file'

export interface VirtualFileSystem {
  readonly name: string

  isFileExists(location: string): Promise<boolean>

  file(location: string): Promise<VirtualFile>

  fileOrNull(location: string): Promise<VirtualFile | null>

  // TODO: Create AsyncIterator
  listFiles(): Promise<VirtualFile[]>

  readTextFile(location: string | VirtualFile): Promise<string>

  refresh(): Promise<void>
}
