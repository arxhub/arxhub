import type { BaseInfoFields, InfoNamespace } from '../info-namespace'
import type { VirtualEntry } from '../virtual-entry'
import type { DeleteOptions, VirtualFileSystem } from '../virtual-file-system'

export interface VirtualFile<T extends Record<string, unknown> = BaseInfoFields> extends VirtualEntry {
  readonly kind: 'file'
  readonly pathname: string
  readonly vfs: VirtualFileSystem
  readonly info: InfoNamespace<T>

  read(): Promise<Uint8Array>
  readable(): Promise<ReadableStream<Uint8Array>>
  readText(): Promise<string>
  readJSON<U>(defaultValue?: U): Promise<U>

  write(content: Uint8Array): Promise<void>
  writable(): Promise<WritableStream<Uint8Array>>
  writeText(content: string): Promise<void>
  writeJSON<U>(content: U): Promise<void>

  delete(options?: DeleteOptions): Promise<void>
  exists(): Promise<boolean>
}
