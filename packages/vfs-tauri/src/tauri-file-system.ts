import type { Logger } from '@arxhub/core'
import { normalizePath } from '@arxhub/path'
import {
  type DeleteOptions,
  type FileHead,
  FileNotFound,
  type VirtualDir,
  VirtualDirImpl,
  type VirtualEntry,
  type VirtualFile,
  VirtualFileImpl,
  type VirtualFileSystem,
  type VirtualWalker,
  VirtualWalkerImpl,
} from '@arxhub/vfs'
import { BaseDirectory, readDir, readFile, remove, stat, writeFile } from '@tauri-apps/plugin-fs'
import AsyncLock from 'async-lock'

export class TauriFileSystem implements VirtualFileSystem {
  private readonly baseDir: BaseDirectory
  private readonly basePath: string
  private readonly _lock = new AsyncLock()
  private readonly logger: Logger

  constructor(basePath: string = '', baseDir: BaseDirectory = BaseDirectory.AppData, logger: Logger) {
    this.basePath = basePath
    this.baseDir = baseDir
    this.logger = logger.child('[TauriFileSystem] ')
  }

  private fullPath(pathname: string): string {
    return this.basePath ? `${this.basePath}/${pathname}` : pathname
  }

  file<T extends Record<string, unknown>>(pathname: string): VirtualFile<T> {
    return new VirtualFileImpl<T>(this, pathname)
  }

  dir(pathname: string): VirtualDir {
    return new VirtualDirImpl(this, pathname)
  }

  async list(prefix: string): Promise<VirtualEntry[]> {
    const norm = normalizePath(prefix)
    const result: VirtualEntry[] = []
    try {
      const entries = await readDir(this.fullPath(norm), { baseDir: this.baseDir })
      for (const entry of entries) {
        const relPath = norm ? `${norm}/${entry.name}` : entry.name
        if (entry.isDirectory) result.push(this.dir(relPath))
        else if (!entry.name.endsWith('.info')) result.push(this.file(relPath))
      }
    } catch (e) {
      this.logger.warn(`list(${prefix}) failed:`, e)
    }
    return result
  }

  walk(prefix: string, cursor?: string): VirtualWalker {
    return new VirtualWalkerImpl(this, normalizePath(prefix), cursor)
  }

  async read(pathname: string): Promise<Uint8Array> {
    try {
      return await readFile(this.fullPath(pathname), { baseDir: this.baseDir })
    } catch (e) {
      this.logger.warn(`read(${pathname}) failed:`, e)
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
    } catch (e) {
      this.logger.warn(`delete(${pathname}) failed:`, e)
      if (!options?.force) throw new FileNotFound(pathname)
    }
  }

  async exists(pathname: string): Promise<boolean> {
    try {
      await stat(this.fullPath(pathname), { baseDir: this.baseDir })
      return true
    } catch (e) {
      this.logger.warn(`exists(${pathname}) failed:`, e)
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
    } catch (e) {
      this.logger.warn(`head(${pathname}) failed:`, e)
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
