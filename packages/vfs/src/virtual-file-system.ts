import type { VirtualFile } from './virtual-file'

export interface VirtualFileSystem {
  listEntries(path: string, opts?: { recursive?: boolean }): AsyncGenerator<VirtualFile>

  getEntry(path: string): Promise<VirtualFile>

  readFile(filename: string): Promise<Buffer>
  getFileReadableStream(filename: string): Promise<ReadableStream>

  writeFile(filename: string, content: Buffer): Promise<void>
  getFileWritableStream(filename: string): Promise<WritableStream>

  deleteFile(filename: string): Promise<void>
  deletePath(path: string): Promise<void>

  isFile(filename: string): Promise<boolean>
  isDirectory(path: string): Promise<boolean>

  isEntryExists(path: string): Promise<boolean>

  getFileHash(algorithm: string): Promise<string>
}
