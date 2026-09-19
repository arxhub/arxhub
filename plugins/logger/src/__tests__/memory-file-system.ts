import { normalizePath } from '@arxhub/path'
import type { DeleteOptions, FileHead } from '@arxhub/vfs'
import { fileNotFound, GenericVirtualFileSystem, type VirtualEntry } from '@arxhub/vfs'

export const dec = (b: Uint8Array) => new TextDecoder().decode(b)

export class MemoryFileSystem extends GenericVirtualFileSystem {
  readonly files = new Map<string, Uint8Array>()

  override async list(prefix: string): Promise<VirtualEntry[]> {
    const base = normalizePath(prefix)
    const dirPrefix = base === '' ? '' : `${base}/`
    const out: VirtualEntry[] = []
    for (const key of this.files.keys()) {
      if (base !== '' && !key.startsWith(dirPrefix)) continue
      const rest = key.slice(dirPrefix.length)
      if (!rest.includes('/')) out.push({ kind: 'file', pathname: key })
    }
    return out
  }

  override async read(pathname: string): Promise<Uint8Array> {
    const found = this.files.get(normalizePath(pathname))
    if (found == null) throw fileNotFound(pathname)
    return found
  }

  override async write(pathname: string, content: Uint8Array): Promise<void> {
    this.files.set(normalizePath(pathname), content)
  }

  override async readable(_pathname: string): Promise<ReadableStream<Uint8Array>> {
    throw new Error('not implemented')
  }

  override async writable(_pathname: string): Promise<WritableStream<Uint8Array>> {
    throw new Error('not implemented')
  }

  override async delete(pathname: string, options?: DeleteOptions): Promise<void> {
    const key = normalizePath(pathname)
    if (!this.files.has(key) && options?.force !== true) throw fileNotFound(pathname)
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
