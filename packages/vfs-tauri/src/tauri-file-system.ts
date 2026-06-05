import type { Logger } from '@arxhub/core'
import { normalizePath } from '@arxhub/path'
import { type DeleteOptions, type FileHead, fileNotFound, GenericVirtualFileSystem, type VirtualEntry } from '@arxhub/vfs'
import { BaseDirectory, readDir, readFile, remove, stat, writeFile } from '@tauri-apps/plugin-fs'

export class TauriFileSystem extends GenericVirtualFileSystem {
  private readonly baseDir: BaseDirectory
  private readonly basePath: string
  private readonly logger: Logger

  constructor(basePath: string = '', baseDir: BaseDirectory = BaseDirectory.AppData, logger: Logger) {
    super()
    this.basePath = basePath
    this.baseDir = baseDir
    this.logger = logger.child('[TauriFileSystem] ')
  }

  private fullPath(pathname: string): string {
    return this.basePath ? `${this.basePath}/${pathname}` : pathname
  }

  async list(prefix: string): Promise<VirtualEntry[]> {
    const norm = normalizePath(prefix)
    const result: VirtualEntry[] = []
    try {
      const entries = await readDir(this.fullPath(norm), { baseDir: this.baseDir })
      for (const entry of entries) {
        const relPath = norm ? `${norm}/${entry.name}` : entry.name
        if (entry.isDirectory) result.push(this.dir(relPath))
        else if (!entry.name.endsWith('.arxmeta')) result.push(this.file(relPath))
      }
    } catch (e) {
      this.logger.warn(`list(${prefix}) failed:`, e)
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
