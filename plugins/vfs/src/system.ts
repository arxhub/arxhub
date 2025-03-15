import type { VirtualFile } from './file'

export interface VirtualFileSystem {
  isFileExists(pathname: string): Promise<boolean>

  file(pathname: string): Promise<VirtualFile>

  fileOrNull(pathname: string): Promise<VirtualFile | null>

  listFiles(): AsyncGenerator<VirtualFile>

  readTextFile(pathname: string): Promise<string>

  refresh(): Promise<void>
}
