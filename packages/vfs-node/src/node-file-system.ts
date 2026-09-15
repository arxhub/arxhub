import { createReadStream, createWriteStream, type Dirent, type FSWatcher, watch as watchFs } from 'node:fs'
import fs from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { Readable, Writable } from 'node:stream'
import type { Logger } from '@arxhub/core'
import { isNodeError } from '@arxhub/errors'
import { normalizePath } from '@arxhub/path'
import {
  type CompareAndSwapCapable,
  type DeleteOptions,
  type FileHead,
  fileNotFound,
  GenericVirtualFileSystem,
  type NativeWatchCapable,
  type RangeCapable,
  type RenameCapable,
  resolveRange,
  sameBytes,
  scopeAccessDenied,
  type VfsChangeListener,
  type VirtualEntry,
} from '@arxhub/vfs'
import AsyncLock from 'async-lock'

// ONE lock for the whole process, keyed by the resolved absolute path — deliberately not the
// per-instance lock GenericVirtualFileSystem carries. Two NodeFileSystem instances over one directory
// (the server's root VFS and a ScopedFileSystem over it resolve to one instance, but a test harness or a
// second component opening the same directory does not) share nothing but the disk, and an instance
// lock would let both pass the compare. Two OS processes over one directory are out of scope: this
// product runs one server per store, and a file lock across processes is a different mechanism.
const swapLocks = new AsyncLock()

export class NodeFileSystem extends GenericVirtualFileSystem implements RenameCapable, RangeCapable, NativeWatchCapable, CompareAndSwapCapable {
  private readonly rootDir: string
  private readonly logger: Logger

  constructor(rootDir: string, logger: Logger) {
    super()
    // Resolve once so the containment check below compares two absolute, normalized OS paths.
    this.rootDir = resolve(rootDir)
    this.logger = logger.child({ name: 'NodeFileSystem' })
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
        if (stat.isFile() && norm) result.push(this.file(norm))
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
      else result.push(this.file(relPath))
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

  // Native append (AppendCapable) — O(delta), unlike write() which rewrites the whole file. Used by
  // the appendEntry op so backends without it fall back to read-modify-write.
  async append(pathname: string, content: Uint8Array): Promise<void> {
    const filePath = this.toOsPath(pathname)
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.appendFile(filePath, content)
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

  // Native range read (RangeCapable): a positional read over an open handle, never the whole file.
  // fs.read can return short of what was asked even mid-file (not just at EOF), so it loops rather
  // than trusting one call to fill the buffer.
  async readRange(pathname: string, offset: number, length?: number): Promise<Uint8Array> {
    const filePath = this.toOsPath(pathname)
    let size: number
    try {
      size = (await fs.stat(filePath)).size
    } catch (e) {
      this.logger.warn(`readRange(${pathname}) failed:`, e)
      throw fileNotFound(pathname)
    }
    const { start, end } = resolveRange(size, offset, length)
    const count = end - start
    const result = new Uint8Array(count)
    if (count === 0) return result
    const handle = await fs.open(filePath, 'r')
    let read = 0
    try {
      while (read < count) {
        const { bytesRead } = await handle.read(result, read, count - read, start + read)
        if (bytesRead === 0) break
        read += bytesRead
      }
    } finally {
      await handle.close()
    }
    // Shorter than stat promised means the file shrank under us; the bytes that exist are the answer,
    // not zero padding up to a size that is no longer true.
    return read < count ? result.subarray(0, read) : result
  }

  async rename(src: string, dest: string): Promise<void> {
    const absSrc = this.toOsPath(src)
    const absDest = this.toOsPath(dest)
    await fs.mkdir(dirname(absDest), { recursive: true })
    await fs.rename(absSrc, absDest)
  }

  // Native compare-and-swap (CompareAndSwapCapable): read-compare-write under the PROCESS-wide lock
  // above, so every instance in this process that resolves to the same file takes turns. Reads with
  // fs.readFile directly rather than this.read(): that one logs a warning and turns every failure into
  // FileNotFound, while "absent" is an expected answer here and any other error must surface.
  async compareAndSwap(pathname: string, expected: Uint8Array | null, next: Uint8Array): Promise<boolean> {
    const filePath = this.toOsPath(pathname)
    return swapLocks.acquire(filePath, async () => {
      let current: Uint8Array | null
      try {
        current = await fs.readFile(filePath)
      } catch (e) {
        if (!isNodeError(e, 'ENOENT')) throw e
        current = null
      }
      if (!sameBytes(current, expected)) return false
      await fs.mkdir(dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, next)
      return true
    })
  }

  // Native watch (NativeWatchCapable): `recursive: true` is answered by the OS on macOS (FSEvents) and
  // Windows (ReadDirectoryChangesW) directly, and by Node itself on Linux (inotify, walked and rewatched
  // per subdirectory) since Node 20 — everywhere this product ships, in other words. The one platform
  // that still refuses the option outright (an older Linux) throws synchronously from `fs.watch` rather
  // than silently ignoring it, which is the only case this falls back for: a non-recursive watch of the
  // root still catches every write and delete at the top level, and anything deeper is caught at the
  // next full stat-walk instead of as it happens.
  async watchTree(prefix: string, listener: VfsChangeListener): Promise<() => void> {
    const absDir = this.toOsPath(prefix)
    await fs.mkdir(absDir, { recursive: true })

    const onEvent = (_event: string, filename: string | Buffer | null) => {
      if (filename == null) return
      const relPath = filename.toString().split(sep).join('/')
      void this.reportNativeChange(absDir, relPath, listener)
    }

    let watcher: FSWatcher
    try {
      watcher = watchFs(absDir, { recursive: true }, onEvent)
    } catch (error) {
      this.logger.warn(`watchTree(${prefix}) recursive watch failed, falling back to a non-recursive watch of the root`, error)
      watcher = watchFs(absDir, { recursive: false }, onEvent)
    }
    return () => watcher.close()
  }

  // A `rename` event fires for both a file's arrival and its departure — the only way to tell them apart
  // is to look. A `change` event only ever fires on something that still exists, but costs nothing extra
  // to route through the same stat. Never tries to pair a rename's two events into one — the journal
  // this feeds treats a rename as delete + write anyway (`ObservedFileSystem.rename`), so there is
  // nothing to gain from it here, and pairing across two independent OS events would be guesswork.
  private async reportNativeChange(absDir: string, relativePath: string, listener: VfsChangeListener): Promise<void> {
    const absPath = resolve(absDir, relativePath.split('/').join(sep))
    try {
      const stats = await fs.stat(absPath)
      if (stats.isDirectory()) return
      listener({ kind: 'written', pathname: relativePath })
    } catch (error) {
      if (isNodeError(error, 'ENOENT')) {
        listener({ kind: 'deleted', pathname: relativePath })
        return
      }
      this.logger.warn(`watchTree stat(${relativePath}) failed:`, error)
    }
  }
}
