import { createReadStream, createWriteStream, type Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { Readable, Writable } from 'node:stream'
import type { Logger } from '@arxhub/core'
import { isNodeError } from '@arxhub/errors'
import { normalizePath } from '@arxhub/path'
import {
  type DeleteOptions,
  type FileHead,
  fileNotFound,
  GenericVirtualFileSystem,
  type RenameCapable,
  scopeAccessDenied,
  type VirtualEntry,
} from '@arxhub/vfs'

export class NodeFileSystem extends GenericVirtualFileSystem implements RenameCapable {
  private readonly rootDir: string
  private readonly logger: Logger

  constructor(rootDir: string, logger: Logger) {
    super()
    // Resolve once so the containment check below compares two absolute, normalized OS paths.
    this.rootDir = resolve(rootDir)
    this.logger = logger.child('[NodeFileSystem] ')
    fs.mkdir(this.rootDir, { recursive: true })
  }

  // The SINGLE OS boundary (ADR 008): node:path is used only here to turn a logical VFS pathname into
  // an absolute OS path, and the result is GUARANTEED to stay inside rootDir. Any pathname that would
  // escape the chosen app storage folder — via '..' or an absolute path — is rejected with a 403, so
  // no caller however untrusted (HTTP clients, plugins, sync) can ever read or write outside it.
  private toOsPath(pathname: string): string {
    const abs = resolve(this.rootDir, normalizePath(pathname))
    const rel = relative(this.rootDir, abs)
    // rel === '' is the root itself (allowed); a leading '..' segment or an absolute rel means escape.
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw scopeAccessDenied(pathname)
    return abs
  }

  async list(prefix: string): Promise<VirtualEntry[]> {
    const norm = normalizePath(prefix)
    const absDir = this.toOsPath(norm)
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
      // Build the LOGICAL ('/') pathname from the normalized prefix + bare filename — never by
      // slicing the OS path, whose separator is '\' on Windows and would leak into the VFS namespace.
      const relPath = norm === '' ? entry.name : `${norm}/${entry.name}`
      if (entry.isDirectory()) result.push(this.dir(relPath))
      else if (!entry.name.endsWith('.arxmeta')) result.push(this.file(relPath))
    }
    return result
  }

  async read(pathname: string): Promise<Uint8Array> {
    const filePath = this.toOsPath(pathname)
    try {
      const buf = await fs.readFile(filePath)
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    } catch (e) {
      this.logger.warn(`read(${pathname}) failed:`, e)
      throw fileNotFound(pathname)
    }
  }

  async readable(pathname: string): Promise<ReadableStream<Uint8Array>> {
    const filePath = this.toOsPath(pathname)
    try {
      await fs.access(filePath)
    } catch (e) {
      this.logger.warn(`readable(${pathname}) failed:`, e)
      throw fileNotFound(pathname)
    }
    return Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>
  }

  async write(pathname: string, content: Uint8Array): Promise<void> {
    const filePath = this.toOsPath(pathname)
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content)
  }

  async writable(pathname: string): Promise<WritableStream<Uint8Array>> {
    const filePath = this.toOsPath(pathname)
    await fs.mkdir(dirname(filePath), { recursive: true })
    return Writable.toWeb(createWriteStream(filePath))
  }

  async delete(pathname: string, options?: DeleteOptions): Promise<void> {
    const filePath = this.toOsPath(pathname)
    try {
      await fs.rm(filePath, {
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
    const filePath = this.toOsPath(pathname)
    try {
      await fs.access(filePath)
      return true
    } catch (e) {
      if (isNodeError(e, 'ENOENT')) return false
      this.logger.warn(`exists(${pathname}) failed:`, e)
      return false
    }
  }

  async head(pathname: string): Promise<FileHead> {
    const filePath = this.toOsPath(pathname)
    try {
      const stats = await fs.stat(filePath)
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
    const absSrc = this.toOsPath(src)
    const absDest = this.toOsPath(dest)
    await fs.mkdir(dirname(absDest), { recursive: true })
    await fs.rename(absSrc, absDest)
  }
}
