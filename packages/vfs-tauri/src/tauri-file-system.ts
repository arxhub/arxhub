import AsyncLock from 'async-lock'
import {
  type DeleteOptions,
  type FileHead,
  FileNotFound,
  type VfsListCursor,
  type VirtualFile,
  type VirtualFileSystem,
  VirtualFileImpl,
  deserializeCursor,
  serializeCursor,
} from '@arxhub/vfs'
import { BaseDirectory, readDir, readFile, remove, stat, writeFile } from '@tauri-apps/plugin-fs'

export class TauriFileSystem implements VirtualFileSystem {
  private readonly baseDir: BaseDirectory
  private readonly basePath: string
  private readonly _lock = new AsyncLock()

  constructor(basePath: string = '', baseDir: BaseDirectory = BaseDirectory.AppData) {
    this.basePath = basePath
    this.baseDir = baseDir
  }

  private fullPath(pathname: string): string {
    return this.basePath ? `${this.basePath}/${pathname}` : pathname
  }

  file<T extends Record<string, unknown>>(pathname: string): VirtualFile<T> {
    return new VirtualFileImpl<T>(this, pathname)
  }

  list(prefix: string, cursor?: string): VfsListCursor {
    const self = this

    let currentQueue: string[]
    let currentPending: string[]

    if (cursor) {
      const state = deserializeCursor(cursor)
      currentQueue = [...state.queue]
      currentPending = [...state.pending]
    } else {
      currentQueue = [prefix]
      currentPending = []
    }

    return {
      cursor(): string {
        return serializeCursor({ queue: currentQueue, pending: currentPending })
      },
      async *[Symbol.asyncIterator](): AsyncGenerator<VirtualFile> {
        while (true) {
          if (currentPending.length > 0) {
            const pathname = currentPending.shift() as string
            yield new VirtualFileImpl(self, pathname)
            continue
          }

          if (currentQueue.length === 0) break

          const relDir = currentQueue.shift() as string

          try {
            const entries = await readDir(self.fullPath(relDir), { baseDir: self.baseDir })
            for (const entry of entries) {
              const relPath = `${relDir}/${entry.name}`
              if (entry.isDirectory) {
                currentQueue.push(relPath)
              } else if (!entry.name.endsWith('.info')) {
                currentPending.push(relPath)
              }
            }
          } catch {
            // skip inaccessible dirs
          }
        }
      },
    }
  }

  async read(pathname: string): Promise<Uint8Array> {
    try {
      return await readFile(this.fullPath(pathname), { baseDir: this.baseDir })
    } catch {
      throw new FileNotFound(pathname)
    }
  }

  async readable(pathname: string): Promise<ReadableStream<Uint8Array>> {
    const content = await this.read(pathname)
    return new ReadableStream({
      start(controller) {
        controller.enqueue(content)
        controller.close()
      },
    })
  }

  async write(pathname: string, content: Uint8Array): Promise<void> {
    await writeFile(this.fullPath(pathname), content, { baseDir: this.baseDir })
  }

  async writable(pathname: string): Promise<WritableStream<Uint8Array>> {
    const self = this
    const chunks: Uint8Array[] = []
    return new WritableStream({
      write(chunk) {
        chunks.push(chunk)
      },
      async close() {
        const total = chunks.reduce((n, c) => n + c.length, 0)
        const all = new Uint8Array(total)
        let offset = 0
        for (const c of chunks) {
          all.set(c, offset)
          offset += c.length
        }
        await self.write(pathname, all)
      },
    })
  }

  async delete(pathname: string, options?: DeleteOptions): Promise<void> {
    try {
      await remove(this.fullPath(pathname), {
        baseDir: this.baseDir,
        recursive: options?.recursive ?? false,
      })
    } catch {
      if (!options?.force) throw new FileNotFound(pathname)
    }
  }

  async exists(pathname: string): Promise<boolean> {
    try {
      await stat(this.fullPath(pathname), { baseDir: this.baseDir })
      return true
    } catch {
      return false
    }
  }

  async head(pathname: string): Promise<FileHead> {
    try {
      const info = await stat(this.fullPath(pathname), { baseDir: this.baseDir })
      return {
        size: info.size,
        modifiedAt: info.mtime?.getTime() ?? Date.now(),
        createdAt: info.birthtime?.getTime() ?? Date.now(),
      }
    } catch {
      throw new FileNotFound(pathname)
    }
  }

  async lock<T>(pathname: string, fn: () => Promise<T>): Promise<T> {
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
}
