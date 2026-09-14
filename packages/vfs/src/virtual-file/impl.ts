import { readRange } from '../ops/read-range'
import type { DeleteOptions, VirtualFileSystem } from '../virtual-file-system'
import type { VirtualFile } from './interface'

// A stateless handle: nothing here outlives the call. What a file's content hashes to is not the
// handle's business either — it used to be, kept in a `.arxmeta` sidecar written beside every save,
// and that made the hash a fact about OUR writes rather than about the file (sync never noticed an
// edit made by anything else). The manifest and the checkout index own that answer now.
export class VirtualFileImpl implements VirtualFile {
  readonly kind = 'file' as const
  readonly pathname: string
  readonly vfs: VirtualFileSystem

  constructor(vfs: VirtualFileSystem, pathname: string) {
    this.pathname = pathname
    this.vfs = vfs
  }

  read(): Promise<Uint8Array> {
    return this.vfs.read(this.pathname)
  }

  readable(): Promise<ReadableStream<Uint8Array>> {
    return this.vfs.readable(this.pathname)
  }

  readRange(offset: number, length?: number): Promise<Uint8Array> {
    return readRange(this.vfs, this.pathname, offset, length)
  }

  async readText(): Promise<string> {
    return new TextDecoder().decode(await this.read())
  }

  async readJSON<U>(defaultValue?: U): Promise<U> {
    if (defaultValue !== undefined && !(await this.exists())) return defaultValue
    return JSON.parse(await this.readText()) as U
  }

  async write(content: Uint8Array): Promise<void> {
    await this.vfs.lock(this.pathname, () => this.vfs.write(this.pathname, content))
  }

  // The lock is held until the stream closes or aborts, so two writers streaming into one path cannot
  // interleave — the same guarantee write() gives in one call.
  async writable(): Promise<WritableStream<Uint8Array>> {
    const release = await this.vfs.acquireLock(this.pathname)
    let inner: WritableStream<Uint8Array>
    try {
      inner = await this.vfs.writable(this.pathname)
    } catch (error) {
      release()
      throw error
    }
    const writer = inner.getWriter()
    return new WritableStream<Uint8Array>({
      write(chunk) {
        return writer.write(chunk)
      },
      async close() {
        try {
          await writer.close()
        } finally {
          release()
        }
      },
      async abort(reason) {
        try {
          await writer.abort(reason)
        } finally {
          release()
        }
      },
    })
  }

  async writeText(content: string): Promise<void> {
    return this.write(new TextEncoder().encode(content))
  }

  async writeJSON<U>(content: U): Promise<void> {
    return this.writeText(JSON.stringify(content, null, 2))
  }

  async delete(options?: DeleteOptions): Promise<void> {
    await this.vfs.lock(this.pathname, () => this.vfs.delete(this.pathname, options))
  }

  exists(): Promise<boolean> {
    return this.vfs.exists(this.pathname)
  }
}
