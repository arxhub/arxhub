import { createReadStream, createWriteStream, Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import type { Logger } from '@arxhub/core'
import { isNodeError } from '@arxhub/errors'
import { normalizePath } from '@arxhub/path'
import { type DeleteOptions, type FileHead, fileNotFound, GenericVirtualFileSystem, type RenameCapable, type VirtualEntry } from '@arxhub/vfs'

export class NodeFileSystem extends GenericVirtualFileSystem implements RenameCapable {
  private readonly rootDir: string
  private readonly logger: Logger

  constructor(rootDir: string, logger: Logger) {
    super()
    this.rootDir = rootDir
    this.logger = logger.child('[NodeFileSystem] ')
    fs.mkdir(rootDir, { recursive: true })
  }

  async list(prefix: string): Promise<VirtualEntry[]> {
    const norm = normalizePath(prefix)
    const absDir = join(this.rootDir, norm)
    const result: VirtualEntry[] = []
    let entries: Dirent[] | null = null
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true })
    } catch (e) {
      this.logger.warn(`list(${prefix}) readdir failed:`, e)
      try {
        const stat = await fs.stat(absDir)
        if (stat.isFile() && norm && !norm.endsWith('.arxmeta')) result.push(this.file(norm))
      } catch (e2) {
        this.logger.warn(`list(${prefix}) stat fallback failed:`, e2)
      }
      return result
    }
    for (const entry of entries) {
      const absEntry = join(absDir, entry.name)
      const relPath = absEntry.slice(this.rootDir.length).replace(/^\/+/, '')
      if (entry.isDirectory()) result.push(this.dir(relPath))
      else if (!entry.name.endsWith('.arxmeta')) result.push(this.file(relPath))
    }
    return result
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
    return Writable.toWeb(createWriteStream(filePath))
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
        if (isNodeError(err, 'ENOENT')) throw fileNotFound(pathname)
        throw err
      }
    }
  }

  async exists(pathname: string): Promise<boolean> {
    try {
      await fs.access(join(this.rootDir, pathname))
      return true
    } catch (e) {
      if (isNodeError(e, 'ENOENT')) return false
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

  async rename(src: string, dest: string): Promise<void> {
    const absSrc = join(this.rootDir, src)
    const absDest = join(this.rootDir, dest)
    await fs.mkdir(dirname(absDest), { recursive: true })
    await fs.rename(absSrc, absDest)
  }

}
