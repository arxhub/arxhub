import type { Logger } from '@arxhub/core'
import { normalizePath } from '@arxhub/path'
import {
  type ContentUrlCapable,
  type DeleteOptions,
  type FileHead,
  fileNotFound,
  GenericVirtualFileSystem,
  type RangeCapable,
  resolveRange,
  type VirtualEntry,
} from '@arxhub/vfs'
import { convertFileSrc } from '@tauri-apps/api/core'
import { appDataDir, homeDir, join as joinPath } from '@tauri-apps/api/path'
import { BaseDirectory, mkdir, open, exists as pathExists, readDir, readFile, remove, SeekMode, stat, writeFile } from '@tauri-apps/plugin-fs'

// The directory a path sits in, or '' at the root. Not `posix.dirname` — that answers '.' for a bare
// name, which `mkdir` would then create as a literal directory called '.'.
function parentOf(pathname: string): string {
  const cut = pathname.lastIndexOf('/')
  return cut <= 0 ? '' : pathname.slice(0, cut)
}

export class TauriFileSystem extends GenericVirtualFileSystem implements RangeCapable, ContentUrlCapable {
  private readonly baseDir: BaseDirectory
  private readonly basePath: string
  private readonly logger: Logger

  constructor(basePath: string = '', baseDir: BaseDirectory = BaseDirectory.AppData, logger: Logger) {
    super()
    this.basePath = basePath
    this.baseDir = baseDir
    this.logger = logger.child({ name: 'TauriFileSystem' })
  }

  private fullPath(pathname: string): string {
    return this.basePath ? `${this.basePath}/${pathname}` : pathname
  }

  async list(prefix: string): Promise<VirtualEntry[]> {
    const norm = normalizePath(prefix)
    const result: VirtualEntry[] = []
    try {
      const path = this.fullPath(norm)
      const options = { baseDir: this.baseDir }
      if (!(await pathExists(path, options))) return result
      const info = await stat(path, options)
      if (info.isFile) return norm ? [this.file(norm)] : []
      const entries = await readDir(path, options)
      for (const entry of entries) {
        const relPath = norm ? `${norm}/${entry.name}` : entry.name
        if (entry.isDirectory) result.push(this.dir(relPath))
        else result.push(this.file(relPath))
      }
    } catch (e) {
      this.logger.warn({ error: String(e) }, `list(${prefix}) failed`)
      throw e
    }
    return result
  }

  async read(pathname: string): Promise<Uint8Array> {
    try {
      return await readFile(this.fullPath(pathname), { baseDir: this.baseDir })
    } catch (e) {
      this.logger.warn(`read(${pathname}) failed:`, e)
      throw fileNotFound(pathname)
    }
  }

  // Seeks rather than reading whole (RangeCapable) — a media viewer over `read()` alone was holding the
  // entire file in memory for a slice of it. `stat` gives the size the range grammar is resolved against;
  // a size that turns out stale (the file shrank between the two calls) is not an error, just fewer bytes.
  async readRange(pathname: string, offset: number, length?: number): Promise<Uint8Array> {
    let info: { size: number }
    try {
      info = await stat(this.fullPath(pathname), { baseDir: this.baseDir })
    } catch (e) {
      this.logger.warn(`readRange(${pathname}) failed:`, e)
      throw fileNotFound(pathname)
    }
    const { start, end } = resolveRange(info.size, offset, length)
    if (start === end) return new Uint8Array(0)

    const result = new Uint8Array(end - start)
    const handle = await open(this.fullPath(pathname), { read: true, baseDir: this.baseDir })
    try {
      await handle.seek(start, SeekMode.Start)
      let filled = 0
      while (filled < result.length) {
        const read = await handle.read(result.subarray(filled))
        if (!read) break // EOF — the file was shorter than `stat` reported; return what we actually got.
        filled += read
      }
      return result.subarray(0, filled)
    } finally {
      await handle.close()
    }
  }

  // A URL the webview loads straight from disk through the asset protocol, which answers `Range` on the
  // Rust side — so a `<video>` seeks without a byte of it passing through JS. The protocol's scope
  // (tauri.conf.json → app.security.assetProtocol) has to cover the store's directory; the two base
  // directories below are the two the app instance mounts a store under.
  async contentUrl(pathname: string): Promise<string | null> {
    const root = this.baseDir === BaseDirectory.AppData ? await appDataDir() : this.baseDir === BaseDirectory.Home ? await homeDir() : null
    if (root == null) return null
    return convertFileSrc(await joinPath(root, this.fullPath(pathname)))
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
    // The VFS has no mkdir of its own — a directory exists because a file in it does, and every backend
    // owes the write its parent. Node's does it (`fs.mkdir(dirname, { recursive: true })` before each
    // write); this one did not, so any write below a directory that was not there yet simply failed.
    // That is one root cause for two symptoms: the theme could not be saved (`storage/theme/` did not
    // exist) and the explorer could not create a folder at all, since a new folder IS a write of
    // `<folder>/.keep`. Reads were fine throughout, which is what made it look like a permission
    // problem rather than a missing call.
    const parent = parentOf(this.fullPath(pathname))
    if (parent) await mkdir(parent, { baseDir: this.baseDir, recursive: true })
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
      if (!options?.force) throw fileNotFound(pathname)
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
      throw fileNotFound(pathname)
    }
  }
}
