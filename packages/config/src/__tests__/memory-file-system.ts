import type { DeleteOptions, FileHead } from '@arxhub/vfs'
import { fileNotFound, GenericVirtualFileSystem, type VirtualEntry } from '@arxhub/vfs'

// A flat in-memory backend, enough for the two operations config performs: read a file that may not
// be there, and write one. Streaming and listing are not on any config path, so they stay unbuilt
// rather than half-built.
export class MemoryFileSystem extends GenericVirtualFileSystem {
  readonly files = new Map<string, Uint8Array>()
  // Set to a path to make its next write reject — how a failed write of the synced file is staged.
  failWriteOn: string | null = null
  failReadOn: string | null = null

  text(pathname: string): string | undefined {
    const found = this.files.get(pathname)
    return found == null ? undefined : new TextDecoder().decode(found)
  }

  seed(pathname: string, content: string): void {
    this.files.set(pathname, new TextEncoder().encode(content))
  }

  override async list(): Promise<VirtualEntry[]> {
    return []
  }

  override async read(pathname: string): Promise<Uint8Array> {
    if (this.failReadOn === pathname) throw new Error(`read refused: ${pathname}`)
    const found = this.files.get(pathname)
    if (found == null) throw fileNotFound(pathname)
    return found
  }

  override async readable(): Promise<ReadableStream<Uint8Array>> {
    throw new Error('not implemented')
  }

  override async write(pathname: string, content: Uint8Array): Promise<void> {
    if (this.failWriteOn === pathname) throw new Error(`write refused: ${pathname}`)
    this.files.set(pathname, content)
  }

  override async writable(): Promise<WritableStream<Uint8Array>> {
    throw new Error('not implemented')
  }

  override async delete(pathname: string, options?: DeleteOptions): Promise<void> {
    if (!this.files.has(pathname) && options?.force !== true) throw fileNotFound(pathname)
    this.files.delete(pathname)
  }

  override async exists(pathname: string): Promise<boolean> {
    return this.files.has(pathname)
  }

  override async head(pathname: string): Promise<FileHead> {
    const bytes = await this.read(pathname)
    return { size: bytes.byteLength, modifiedAt: 0, createdAt: 0 }
  }
}
