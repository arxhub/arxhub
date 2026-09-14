import type { VirtualEntry } from '../virtual-entry'
import type { DeleteOptions, VirtualFileSystem } from '../virtual-file-system'

export interface VirtualFile extends VirtualEntry {
  readonly kind: 'file'
  readonly pathname: string
  readonly vfs: VirtualFileSystem

  read(): Promise<Uint8Array>
  readable(): Promise<ReadableStream<Uint8Array>>
  // A slice of the file — see RangeCapable for the grammar. Native where the backend can seek, a cut of
  // the whole file where it cannot.
  readRange(offset: number, length?: number): Promise<Uint8Array>
  readText(): Promise<string>
  readJSON<U>(defaultValue?: U): Promise<U>

  write(content: Uint8Array): Promise<void>
  writable(): Promise<WritableStream<Uint8Array>>
  writeText(content: string): Promise<void>
  writeJSON<U>(content: U): Promise<void>

  delete(options?: DeleteOptions): Promise<void>
  exists(): Promise<boolean>
}
