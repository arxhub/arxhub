import { createReadStream, createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import {
  type DeleteOptions,
  type FileHead,
  FileNotFound,
  normalizePath,
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

  constructor(rootDir: string) {
    this.rootDir = rootDir
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
    } catch {
      try {
        const stat = await fs.stat(absDir)
        if (stat.isFile() && norm && !norm.endsWith('.info')) result.push(this.file(norm))
      } catch {
        /* skip inaccessible paths */
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
    } catch {
      throw new FileNotFound(pathname)
    }
  }

  async readable(pathname: string): Promise<ReadableStream<Uint8Array>> {
    const filePath = join(this.rootDir, pathname)
    try {
      await fs.access(filePath)
    } catch {
      throw new FileNotFound(pathname)
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
      if (!options?.force) {
        const code = (err as NodeJS.ErrnoException).code
        if (code === 'ENOENT') throw new FileNotFound(pathname)
        throw err
      }
    }
  }

  async exists(pathname: string): Promise<boolean> {
    try {
      await fs.access(join(this.rootDir, pathname))
      return true
    } catch {
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
