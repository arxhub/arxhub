import { normalizePath } from '@arxhub/path'
import type { RenameCapable } from '../capabilities/rename'
import { fileNotFound } from '../errors'
import { GenericVirtualFileSystem } from '../generic-virtual-file-system'
import { INFO_FILE_SUFFIX } from '../vfs-watcher'
import type { VirtualEntry } from '../virtual-entry'
import type { DeleteOptions, FileHead } from '../virtual-file-system'

export const enc = (s: string) => new TextEncoder().encode(s)
export const dec = (b: Uint8Array) => new TextDecoder().decode(b)

// A flat in-memory backend that behaves like the real ones on the points a decorator can get wrong:
// `.arxmeta` sidecars are hidden from list/walk, a missing read rejects with FileNotFound, and a delete
// of something absent only passes with `force`.
export class MemoryFileSystem extends GenericVirtualFileSystem {
  readonly files = new Map<string, Uint8Array>()
  // Set to a path to make its next write reject, so a failed write can be observed.
  failWriteOn: string | null = null

  seed(pathname: string, content = 'x'): void {
    this.files.set(normalizePath(pathname), enc(content))
  }

  override async list(prefix: string): Promise<VirtualEntry[]> {
    const base = normalizePath(prefix)
    // A file path lists as itself, like NodeFileSystem's stat fallback — renameEntry's copy walks the
    // source, and for a single file that walk has to find it.
    if (base !== '' && this.files.has(base)) return base.endsWith(INFO_FILE_SUFFIX) ? [] : [{ kind: 'file', pathname: base }]

    const dirPrefix = base === '' ? '' : `${base}/`
    const dirs = new Set<string>()
    const out: VirtualEntry[] = []
    for (const key of this.files.keys()) {
      if (base !== '' && !key.startsWith(dirPrefix)) continue
      if (key.endsWith(INFO_FILE_SUFFIX)) continue
      const rest = key.slice(dirPrefix.length)
      const slash = rest.indexOf('/')
      if (slash === -1) out.push({ kind: 'file', pathname: key })
      else dirs.add(`${dirPrefix}${rest.slice(0, slash)}`)
    }
    for (const dir of dirs) out.push({ kind: 'dir', pathname: dir })
    return out
  }

  override async read(pathname: string): Promise<Uint8Array> {
    const found = this.files.get(normalizePath(pathname))
    if (found == null) throw fileNotFound(pathname)
    return found
  }

  override async readable(pathname: string): Promise<ReadableStream<Uint8Array>> {
    const bytes = await this.read(pathname)
    return new ReadableStream({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    })
  }

  override async write(pathname: string, content: Uint8Array): Promise<void> {
    const key = normalizePath(pathname)
    if (this.failWriteOn === key) throw fileNotFound(pathname)
    this.files.set(key, content)
  }

  override async writable(pathname: string): Promise<WritableStream<Uint8Array>> {
    const key = normalizePath(pathname)
    const chunks: Uint8Array[] = []
    const files = this.files
    return new WritableStream({
      write(chunk) {
        chunks.push(chunk)
      },
      close() {
        files.set(key, enc(chunks.map(dec).join('')))
      },
    })
  }

  override async delete(pathname: string, options?: DeleteOptions): Promise<void> {
    const key = normalizePath(pathname)
    if (options?.recursive === true) {
      for (const existing of Array.from(this.files.keys())) {
        if (existing === key || existing.startsWith(`${key}/`)) this.files.delete(existing)
      }
      return
    }
    if (!this.files.has(key)) {
      if (options?.force === true) return
      throw fileNotFound(pathname)
    }
    this.files.delete(key)
  }

  override async exists(pathname: string): Promise<boolean> {
    return this.files.has(normalizePath(pathname))
  }

  override async head(pathname: string): Promise<FileHead> {
    const bytes = await this.read(pathname)
    return { size: bytes.byteLength, modifiedAt: 0, createdAt: 0 }
  }
}

// The same backend, with a native rename — what NodeFileSystem is, and what makes a decorator over it
// rename-capable in turn.
export class RenamingMemoryFileSystem extends MemoryFileSystem implements RenameCapable {
  async rename(src: string, dest: string): Promise<void> {
    const from = normalizePath(src)
    const to = normalizePath(dest)
    for (const [key, value] of Array.from(this.files.entries())) {
      if (key !== from && !key.startsWith(`${from}/`)) continue
      this.files.delete(key)
      this.files.set(`${to}${key.slice(from.length)}`, value)
    }
  }
}
