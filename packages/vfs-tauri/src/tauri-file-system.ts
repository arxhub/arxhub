import type { Logger } from '@arxhub/core'
import { normalizePath } from '@arxhub/path'
import { type DeleteOptions, type FileHead, fileNotFound, GenericVirtualFileSystem, type VirtualEntry } from '@arxhub/vfs'
import { BaseDirectory, mkdir, exists as pathExists, readDir, readFile, remove, stat, writeFile } from '@tauri-apps/plugin-fs'

// The directory a path sits in, or '' at the root. Not `posix.dirname` — that answers '.' for a bare
// name, which `mkdir` would then create as a literal directory called '.'.
function parentOf(pathname: string): string {
  const cut = pathname.lastIndexOf('/')
  return cut <= 0 ? '' : pathname.slice(0, cut)
}

export class TauriFileSystem extends GenericVirtualFileSystem {
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
      if (info.isFile) return norm && !norm.endsWith('.arxmeta') ? [this.file(norm)] : []
      const entries = await readDir(path, options)
      for (const entry of entries) {
        const relPath = norm ? `${norm}/${entry.name}` : entry.name
        if (entry.isDirectory) result.push(this.dir(relPath))
        else if (!entry.name.endsWith('.arxmeta')) result.push(this.file(relPath))
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
