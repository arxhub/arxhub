import type { BaseInfoFields, InfoNamespace } from './info-namespace'
import type { VirtualDir } from './virtual-dir'
import type { VirtualEntry } from './virtual-entry'
import type { VirtualFile } from './virtual-file'
import type { VirtualWalker } from './virtual-walker'

export interface DeleteOptions {
  force?: boolean
  recursive?: boolean
}

export interface VirtualFileSystem {
  file<T extends Record<string, unknown> = BaseInfoFields>(pathname: string): VirtualFile<T>
  dir(pathname: string): VirtualDir

  list(prefix: string): Promise<VirtualEntry[]>
  walk(prefix: string, cursor?: string): VirtualWalker

  read(pathname: string): Promise<Uint8Array>
  readable(pathname: string): Promise<ReadableStream<Uint8Array>>

  write(pathname: string, content: Uint8Array): Promise<void>
  writable(pathname: string): Promise<WritableStream<Uint8Array>>

  delete(pathname: string, options?: DeleteOptions): Promise<void>

  exists(pathname: string): Promise<boolean>
  head(pathname: string): Promise<InfoNamespace>

  lock<T>(pathname: string, fn: () => Promise<T>): Promise<T>
  acquireLock(pathname: string): Promise<() => void>
}
