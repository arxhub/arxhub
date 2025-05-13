import type { VirtualFile } from './virtual-file'

export interface VirtualFileSystem {
  file(id: string): Promise<VirtualFile>
  fileOrNull(id: string): Promise<VirtualFile | null>

  listFiles(): AsyncGenerator<VirtualFile>

  readFile(id: string): Promise<Buffer>
  readTextFile(id: string): Promise<string>

  writeFile(id: string): Promise<Buffer>
  writeTextFile(id: string, content: string): Promise<void>

  isFileExists(id: string): Promise<boolean>
}
