import type { DeleteOptions } from './types/delete-options'
import type { VirtualFile } from './virtual-file'

export interface VirtualFileSystem {
  list(prefix: string): AsyncGenerator<VirtualFile>

  file(filename: string): VirtualFile

  read(filename: string): Promise<Buffer>
  readableStream(filename: string): Promise<ReadableStream>

  write(filename: string, content: Buffer): Promise<void>
  writableStream(filename: string): Promise<WritableStream>

  delete(path: string, options?: DeleteOptions): Promise<void>

  head(filename: string): Promise<unknown>
  isExists(filename: string): Promise<boolean>

  hash(filename: string, algorithm: string): Promise<string>
}
