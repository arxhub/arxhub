import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import type { Logger } from '@arxhub/core'
import { normalizePath } from '@arxhub/path'
import {
  type DeleteOptions,
  type FileHead,
  fileNotFound,
  type VirtualDir,
  VirtualDirImpl,
  type VirtualEntry,
  type VirtualFile,
  VirtualFileImpl,
  type VirtualFileSystem,
  type VirtualWalker,
  VirtualWalkerImpl,
} from '@arxhub/vfs'
import AsyncLock from 'async-lock'

export class NodeFileSystem implements VirtualFileSystem {
  private readonly rootDir: string
  private readonly _lock = new AsyncLock()
  private readonly logger: Logger

  constructor(rootDir: string, logger: Logger) {
    this.rootDir = rootDir
    this.logger = logger.child('[NodeFileSystem] ')
  }

  file<T extends Record<string, unknown>>(pathname: string): VirtualFile<T> {
    return new VirtualFileImpl<T>(this, pathname)
  }

  dir(pathname: string): VirtualDir {
    return new VirtualDirImpl(this, pathname)
  }

  async list(prefix: string): Promise<VirtualEntry[]> {
    const norm = normalizePath(prefix)
    const absDir = join(this.rootDir, norm)
    const result: VirtualEntry[] = []
    let entries: Awaited<ReturnType<typeof fs.readdir>> | null = null
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true })
    } catch (e) {
      this.logger.warn(`list(${prefix}) readdir failed:`, e)
      try {
        const stat = await fs.stat(absDir)
        if (stat.isFile() && norm && !norm.endsWith('.info')) result.push(this.file(norm))
      } catch (e2) {
        this.logger.warn(`list(${prefix}) stat fallback failed:`, e2)
      }
      return result
    }
    for (const entry of entries) {
      const absEntry = join(absDir, entry.name)
      const relPath = absEntry.slice(this.rootDir.length).replace(/^\/+/, '')
      if (entry.isDirectory()) result.push(this.dir(relPath))
      else if (!entry.name.endsWith('.info')) result.push(this.file(relPath))
    }
    return result
  }

  walk(prefix: string, cursor?: string): VirtualWalker {
    return new VirtualWalkerImpl(this, normalizePath(prefix), cursor)
  }

  async read(pathname: string): Promise<Uint8Array> {
    try {
      const buf = await fs.readFile(join(this.rootDir, pathname))
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    } catch (e) {
      this.logger.warn(`read(${pathname}) failed:`, e)
      throw fileNotFound(pathname)
    }
  }

  async readable(pathname: string): Promise<ReadableStream<Uint8Array>> {
    const filePath = join(this.rootDir, pathname)
    try {
      await fs.access(filePath)
    } catch (e) {
      this.logger.warn(`readable(${pathname}) failed:`, e)
      throw fileNotFound(pathname)
    }
    return Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>
  }

  async write(pathname: string, content: Uint8Array): Promise<void> {
    const filePath = join(this.rootDir, pathname)
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content)
  }

  async writable(pathname: string): Promise<WritableStream<Uint8Array>> {
    const filePath = join(this.rootDir, pathname)
    await fs.mkdir(dirname(filePath), { recursive: true })
    return Writable.toWeb(createWriteStream(filePath)) as unknown as WritableStream<Uint8Array>
  }

  async delete(pathname: string, options?: DeleteOptions): Promise<void> {
    try {
      await fs.rm(join(this.rootDir, pathname), {
        force: options?.force ?? false,
        recursive: options?.recursive ?? false,
      })
    } catch (err) {
      this.logger.warn(`delete(${pathname}) failed:`, err)
      if (!options?.force) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') throw fileNotFound(pathname)
        throw err
      }
    }
  }

  async exists(pathname: string): Promise<boolean> {
    try {
      await fs.access(join(this.rootDir, pathname))
      return true
    } catch (e) {
      this.logger.warn(`exists(${pathname}) failed:`, e)
      return false
    }
  }

  async head(pathname: string): Promise<FileHead> {
    try {
      const stats = await fs.stat(join(this.rootDir, pathname))
      return {
        size: stats.size,
        modifiedAt: stats.mtime.getTime(),
        createdAt: stats.birthtime.getTime(),
      }
    } catch (e) {
      this.logger.warn(`head(${pathname}) failed:`, e)
      throw fileNotFound(pathname)
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
