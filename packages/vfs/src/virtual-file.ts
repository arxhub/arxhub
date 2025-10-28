import type { DeleteOptions } from './types/delete-options'
import type { VirtualFileSystem } from './virtual-file-system'

export interface VirtualFile {
  readonly vfs: VirtualFileSystem

  // /home/user/file.txt
  readonly pathname: string

  // /home/user
  readonly path: string

  // file
  readonly name: string

  // txt
  readonly extension: string

  read(): Promise<Buffer>
  readText(): Promise<string>
  readJSON<T>(defaultValue?: T): Promise<T>
  readable(): Promise<ReadableStream<Uint8Array>>

  write(content: Buffer): Promise<void>
  writeText(content: string): Promise<void>
  writeJSON<T>(content: T): Promise<void>
  writable(): Promise<WritableStream<Uint8Array>>

  delete(options?: DeleteOptions): Promise<void>

  isExists(): Promise<boolean>

  hash(algorithm: string): Promise<string>

  head(): Promise<unknown>
}
