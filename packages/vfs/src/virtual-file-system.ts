import type { VirtualFile } from './virtual-file'

export interface VirtualFileSystem {
  // Maybe we should return like a pointer?
  file(id: string, opts?: { create?: boolean }): Promise<VirtualFile>
  fileOrNull(id: string): Promise<VirtualFile | null>

  listFiles(path: string, opts?: { recursive?: boolean }): AsyncGenerator<VirtualFile>

  readFile(id: string): Promise<Buffer>
  readTextFile(id: string): Promise<string>

  writeFile(id: string): Promise<Buffer>
  writeTextFile(id: string, content: string): Promise<void>

  appendTextFile(id: string, content: string): Promise<void>

  isDirectory(id: string): Promise<boolean>
  isFileExists(id: string): Promise<boolean>
}
