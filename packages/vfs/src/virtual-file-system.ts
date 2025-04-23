import type { VirtualFile } from './virtual-file'

export interface VirtualFileSystem {
  isFileExists(pathname: string): Promise<boolean>

  file(pathname: string): Promise<VirtualFile>

  fileOrNull(pathname: string): Promise<VirtualFile | null>

  listFiles(): AsyncGenerator<VirtualFile>

  readTextFile(pathname: string): Promise<string>

  writeTextFile(pathname: string, content: string): Promise<void>

  refresh(): Promise<void>
}
