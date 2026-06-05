import AsyncLock from 'async-lock'
import { normalizePath } from '@arxhub/path'
import type { VirtualDir } from './virtual-dir'
import { VirtualDirImpl } from './virtual-dir'
import type { VirtualEntry } from './virtual-entry'
import type { VirtualFile } from './virtual-file'
import { VirtualFileImpl } from './virtual-file'
import type { DeleteOptions, FileHead, VirtualFileSystem } from './virtual-file-system'
import type { VirtualWalker } from './virtual-walker'
import { VirtualWalkerImpl } from './virtual-walker'

export abstract class GenericVirtualFileSystem implements VirtualFileSystem {
  private readonly _lock = new AsyncLock()

  file<T extends Record<string, unknown>>(pathname: string): VirtualFile<T> {
    return new VirtualFileImpl<T>(this, pathname)
  }

  dir(pathname: string): VirtualDir {
    return new VirtualDirImpl(this, pathname)
  }

  walk(prefix: string, cursor?: string): VirtualWalker {
    return new VirtualWalkerImpl(this, normalizePath(prefix), cursor)
  }

  lock<T>(pathname: string, fn: () => Promise<T>): Promise<T> {
    return this._lock.acquire(pathname, fn)
  }

  async acquireLock(pathname: string): Promise<() => void> {
    let release!: () => void
    await new Promise<void>((outer) => {
      this._lock.acquire(
        pathname,
        () =>
          new Promise<void>((inner) => {
            release = inner
            outer()
          }),
      )
    })
    return release
  }

  abstract list(prefix: string): Promise<VirtualEntry[]>
  abstract read(pathname: string): Promise<Uint8Array>
  abstract readable(pathname: string): Promise<ReadableStream<Uint8Array>>
  abstract write(pathname: string, content: Uint8Array): Promise<void>
  abstract writable(pathname: string): Promise<WritableStream<Uint8Array>>
  abstract delete(pathname: string, options?: DeleteOptions): Promise<void>
  abstract exists(pathname: string): Promise<boolean>
  abstract head(pathname: string): Promise<FileHead>
}
