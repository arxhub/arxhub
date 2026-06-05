import { createHasher, hash } from '@arxhub/crypto'
import type { BaseInfoFields, InfoNamespace } from '../info-namespace'
import { InfoNamespaceImpl } from '../info-namespace/impl'
import { infoFileAccess } from '../errors'
import type { VirtualFile } from './interface'
import type { DeleteOptions, VirtualFileSystem } from '../virtual-file-system'

export class VirtualFileImpl<T extends Record<string, unknown> = BaseInfoFields> implements VirtualFile<T> {
  readonly kind = 'file' as const
  readonly pathname: string
  readonly vfs: VirtualFileSystem
  readonly info: InfoNamespace<T>

  constructor(vfs: VirtualFileSystem, pathname: string) {
    if (pathname.endsWith('.arxmeta')) throw infoFileAccess(pathname)
    this.pathname = pathname
    this.vfs = vfs
    this.info = new InfoNamespaceImpl<T>(this)
  }

  read(): Promise<Uint8Array> {
    return this.vfs.read(this.pathname)
  }

  readable(): Promise<ReadableStream<Uint8Array>> {
    return this.vfs.readable(this.pathname)
  }

  async readText(): Promise<string> {
    return new TextDecoder().decode(await this.read())
  }

  async readJSON<U>(defaultValue?: U): Promise<U> {
    if (defaultValue !== undefined && !(await this.exists())) return defaultValue
    return JSON.parse(await this.readText()) as U
  }

  async write(content: Uint8Array): Promise<void> {
    await this.vfs.lock(this.pathname, async () => {
      await this.vfs.write(this.pathname, content)
      await this.info.set('hash' as never, await hash(content, 'sha256') as never, { flush: true })
    })
  }

  async writable(): Promise<WritableStream<Uint8Array>> {
    const release = await this.vfs.acquireLock(this.pathname)
    const inner = await this.vfs.writable(this.pathname)
    const setHash = (h: string) => this.info.set('hash' as never, h as never, { flush: true })
    return wrapWritableWithHash(inner, release, setHash)
  }

  async writeText(content: string): Promise<void> {
    return this.write(new TextEncoder().encode(content))
  }

  async writeJSON<U>(content: U): Promise<void> {
    return this.writeText(JSON.stringify(content, null, 2))
  }

  async delete(options?: DeleteOptions): Promise<void> {
    await this.vfs.lock(this.pathname, async () => {
      await this.vfs.delete(this.pathname, options)
      await this.vfs.delete(`${this.pathname}.arxmeta`, { force: true })
    })
  }

  exists(): Promise<boolean> {
    return this.vfs.exists(this.pathname)
  }
}

function wrapWritableWithHash(
  inner: WritableStream<Uint8Array>,
  release: () => void,
  onHash: (h: string) => Promise<void>,
): WritableStream<Uint8Array> {
  const hasher = createHasher('sha256')
  const writer = inner.getWriter()
  return new WritableStream({
    write(chunk) {
      hasher.update(chunk)
      return writer.write(chunk)
    },
    async close() {
      await writer.close()
      const hex = await hasher.digest('hex')
      try {
        await onHash(hex)
      } finally {
        release()
      }
    },
    async abort(reason) {
      await writer.abort(reason)
      release()
    },
  })
}
