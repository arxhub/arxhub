import type { Logger } from '@arxhub/core'
import { illegalState, internalServer } from '@arxhub/errors'
import { normalizePath } from '@arxhub/path'
import {
  type ContentUrlCapable,
  type DeleteOptions,
  type FileHead,
  fileNotFound,
  GenericVirtualFileSystem,
  type NativeWatchCapable,
  type OpenExternallyCapable,
  type RangeCapable,
  resolveRange,
  type VfsChangeListener,
  type VirtualEntry,
} from '@arxhub/vfs'
import { convertFileSrc } from '@tauri-apps/api/core'
import { appDataDir, homeDir, join as joinPath } from '@tauri-apps/api/path'
import {
  BaseDirectory,
  mkdir,
  open,
  exists as pathExists,
  readDir,
  readFile,
  remove,
  SeekMode,
  stat,
  type WatchEvent,
  watch,
  writeFile,
} from '@tauri-apps/plugin-fs'
import { openPath } from '@tauri-apps/plugin-opener'

// The directory a path sits in, or '' at the root. Not `posix.dirname` — that answers '.' for a bare
// name, which `mkdir` would then create as a literal directory called '.'.
function parentOf(pathname: string): string {
  const cut = pathname.lastIndexOf('/')
  return cut <= 0 ? '' : pathname.slice(0, cut)
}

export class TauriFileSystem
  extends GenericVirtualFileSystem
  implements RangeCapable, ContentUrlCapable, OpenExternallyCapable, NativeWatchCapable
{
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
    const path = this.fullPath(pathname)
    const options = { baseDir: this.baseDir }
    try {
      return await readFile(path, options)
    } catch (e) {
      this.logger.warn(`read(${pathname}) failed:`, e)
      // The Tauri API does not expose a stable error code. Ask its native exists primitive instead of
      // parsing platform-specific messages; only confirmed absence may seed a default file.
      let exists: boolean
      try {
        exists = await pathExists(path, options)
      } catch (existsError) {
        throw internalServer(existsError, `Could not check '${pathname}' after it failed to read`, 'File read failed')
      }
      if (!exists) throw fileNotFound(pathname)
      throw internalServer(e, `Could not read '${pathname}'`, 'File read failed')
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

  // The absolute path of `pathname` in this store, or null when it sits under a base directory the app
  // never mounts a store under (there is nothing for `contentUrl` or `openExternally` to resolve to).
  private async absolutePath(pathname: string): Promise<string | null> {
    const root = this.baseDir === BaseDirectory.AppData ? await appDataDir() : this.baseDir === BaseDirectory.Home ? await homeDir() : null
    if (root == null) return null
    return joinPath(root, this.fullPath(pathname))
  }

  // A URL the webview loads straight from disk through the asset protocol, which answers `Range` on the
  // Rust side — so a `<video>` seeks without a byte of it passing through JS. The protocol's scope
  // (tauri.conf.json → app.security.assetProtocol) has to cover the store's directory; the two base
  // directories `absolutePath` resolves are the two the app instance mounts a store under.
  async contentUrl(pathname: string): Promise<string | null> {
    const absolute = await this.absolutePath(pathname)
    return absolute == null ? null : convertFileSrc(absolute)
  }

  // Hands the file to whatever the OS has registered for it — the SketchUp-file case: a vault file that
  // is edited by its own native application, not by us. `openPath` is Tauri's own opener plugin (already
  // registered in the app's Rust side, capability `opener:allow-open-path`); it needs the real absolute
  // path, exactly the one `contentUrl` resolves.
  async openExternally(pathname: string): Promise<void> {
    const absolute = await this.absolutePath(pathname)
    if (absolute == null) throw illegalState('This store has no path the system can open')
    await openPath(absolute)
  }

  // Known synchronously from the base directory alone — the same two stores `absolutePath` can resolve —
  // so a UI can decide whether to show the action without waiting on a promise.
  canOpenExternally(): boolean {
    return this.baseDir === BaseDirectory.AppData || this.baseDir === BaseDirectory.Home
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

  // Native watch (NativeWatchCapable): the debounced `watch`, not `watchImmediate` — a save is many
  // events on the Rust side too, and its own 300ms coalesces them before this ever sees one. The events
  // it reports carry absolute filesystem paths (the inverse of `fullPath`, not paths relative to what
  // was asked for), which is why this needs `absolutePath` — the same resolution `contentUrl` and
  // `openExternally` already do — to turn them back into paths relative to `prefix`.
  async watchTree(prefix: string, listener: VfsChangeListener): Promise<() => void> {
    const absDir = await this.absolutePath(prefix)
    if (absDir == null) throw illegalState('This store has no path the system can watch')

    const watchPath = this.fullPath(prefix)
    if (watchPath) await mkdir(watchPath, { baseDir: this.baseDir, recursive: true })

    return watch(watchPath, (event) => void this.handleWatchEvent(absDir, event, listener), {
      baseDir: this.baseDir,
      recursive: true,
      delayMs: 300,
    })
  }

  // An absolute event path is reported relative to `absDir` — the same directory `prefix` resolves to —
  // by cutting the common prefix and normalizing the separator; Tauri's paths are OS-native ('\' on
  // Windows) like every other absolute path this class works with.
  private relativeToWatchedDir(absDir: string, absPath: string): string {
    const rel = absPath.startsWith(absDir) ? absPath.slice(absDir.length) : absPath
    return rel
      .replace(/^[\\/]+/, '')
      .split(/[\\/]/)
      .join('/')
  }

  private notify(absDir: string, absPath: string, kind: 'written' | 'deleted', listener: VfsChangeListener): void {
    listener({ kind, pathname: this.relativeToWatchedDir(absDir, absPath) })
  }

  // A lone end of a rename (mode 'to' or 'from', reported without its counterpart) can't be told apart
  // from here — the same resolution NodeFileSystem falls back to for its own ambiguous case.
  private async statAndNotify(absDir: string, absPath: string, listener: VfsChangeListener): Promise<void> {
    try {
      const info = await stat(absPath)
      if (info.isDirectory) return
      this.notify(absDir, absPath, 'written', listener)
    } catch {
      this.notify(absDir, absPath, 'deleted', listener)
    }
  }

  private async handleWatchEvent(absDir: string, event: WatchEvent, listener: VfsChangeListener): Promise<void> {
    const kind = event.type
    const isRename = typeof kind === 'object' && 'modify' in kind && kind.modify.kind === 'rename'

    // Both ends given in one event (mode 'both') — reported as delete + write, like every other backend:
    // the journal treats a rename as delete + write anyway (`ObservedFileSystem.rename`), so there is
    // nothing to gain from pairing them here either.
    if (isRename && event.paths.length >= 2) {
      this.notify(absDir, event.paths[0], 'deleted', listener)
      this.notify(absDir, event.paths[1], 'written', listener)
      return
    }

    for (const absPath of event.paths) {
      if (typeof kind === 'object' && 'create' in kind) {
        if (kind.create.kind !== 'folder') this.notify(absDir, absPath, 'written', listener)
      } else if (typeof kind === 'object' && 'remove' in kind) {
        if (kind.remove.kind !== 'folder') this.notify(absDir, absPath, 'deleted', listener)
      } else if (typeof kind === 'object' && 'access' in kind) {
        // Not a content change.
      } else if (typeof kind === 'object' && 'modify' in kind && kind.modify.kind !== 'rename') {
        this.notify(absDir, absPath, 'written', listener)
      } else {
        // 'any' | 'other' | a lone rename end.
        await this.statAndNotify(absDir, absPath, listener)
      }
    }
  }
}
