import type { ReadonlyDeep } from 'type-fest'
import type { DeleteOptions } from './types/delete-options'
import type { FileFields } from './types/file-fields'
import type { FileMetadata } from './types/file-metadata'
import type { VirtualFileSystem } from './virtual-file-system'

export interface FileMutations {
  setField<K extends keyof FileFields>(key: K, value: FileFields[K]): void
  setFields(fields: Partial<FileFields>): void
  setMetadata<K extends keyof FileMetadata>(key: K, value: FileMetadata[K]): void
  batch(changes: { fields?: Partial<FileFields>; metadata?: Partial<FileMetadata> }): void
}

export interface VirtualFile {
  readonly vfs: VirtualFileSystem

  readonly pathname: string

  readonly path: string

  readonly name: string

  readonly extension: string

  readonly fields: ReadonlyDeep<FileFields>

  readonly metadata: ReadonlyDeep<FileMetadata>

  readonly mutate: FileMutations

  load(): Promise<void>

  flush(): Promise<void>

  isDirty(): boolean

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
