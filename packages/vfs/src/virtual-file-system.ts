import type { BaseInfoFields } from './info-namespace'
import type { VfsListCursor } from './vfs-list-cursor'
import type { VirtualFile } from './virtual-file'

export interface DeleteOptions {
  force?: boolean
  recursive?: boolean
}

export interface FileHead {
  size: number
  modifiedAt: number
  createdAt: number
}

export interface VirtualFileSystem {
  file<T extends Record<string, unknown> = BaseInfoFields>(pathname: string): VirtualFile<T>
  list(prefix: string, cursor?: string): VfsListCursor

  read(pathname: string): Promise<Uint8Array>
  readable(pathname: string): Promise<ReadableStream<Uint8Array>>

  write(pathname: string, content: Uint8Array): Promise<void>
  writable(pathname: string): Promise<WritableStream<Uint8Array>>

  delete(pathname: string, options?: DeleteOptions): Promise<void>

  exists(pathname: string): Promise<boolean>
  head(pathname: string): Promise<FileHead>

  lock<T>(pathname: string, fn: () => Promise<T>): Promise<T>
  acquireLock(pathname: string): Promise<() => void>
}
