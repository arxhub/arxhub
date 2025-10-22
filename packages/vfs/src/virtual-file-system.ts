import type { VirtualFile } from './virtual-file'

export interface VirtualFileSystem {
  listFiles(path: string, opts?: { recursive?: boolean }): AsyncGenerator<VirtualFile>

  file(id: string): Promise<VirtualFile>

  readFile(id: string): Promise<Buffer>
  getFileReadable(id: string): Promise<ReadableStream>

  writeFile(id: string, content: Buffer): Promise<void>
  getFileWritable(id: string): Promise<WritableStream>

  deleteFile(id: string): Promise<void>

  isFileExists(id: string): Promise<boolean>

  getFileHash(algorithm: string): Promise<string>
}
