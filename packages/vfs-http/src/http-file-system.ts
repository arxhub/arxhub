import type { Logger } from '@arxhub/core'
import { type RequestSigner, signingMiddleware } from '@arxhub/crypto'
import { createTypedHttp, isHttpError } from '@arxhub/http'
import { normalizePath } from '@arxhub/path'
import { type DeleteOptions, type FileHead, fileNotFound, GenericVirtualFileSystem, type VirtualEntry } from '@arxhub/vfs'
import type { VfsApp } from './server'

export interface HttpFileSystemOptions {
  // Where the server mounts the VFS routes, e.g. `https://hub.example.com/api/vfs` (or `/api/vfs` for
  // same-origin through the dev proxy). Routes are relative, so this baseUrl carries the whole prefix.
  baseUrl?: string
  // Override the fetch implementation (mainly for testing). Defaults to the global fetch.
  fetch?: typeof fetch
  // Signs every request with the user's auth key so a protected server accepts it. Omit for an
  // unauthenticated backend; provide the shared MutableRequestSigner for a protected one.
  signer?: RequestSigner
}

// VirtualFileSystem backed by an ArxHub server over HTTP, typed end-to-end from the server's `VfsApp`
// (urls/query/responses inferred — no route consts or DTOs). Used when the app runs in a plain browser;
// under Tauri the native filesystem is used instead.
//
// Locking cannot span stateless HTTP requests from the browser, so `lock`/`acquireLock` run the
// critical section locally and rely on the server's per-request write atomicity.
export class HttpFileSystem extends GenericVirtualFileSystem {
  private readonly http: ReturnType<typeof createTypedHttp<VfsApp>>
  private readonly logger: Logger

  constructor(options: HttpFileSystemOptions, logger: Logger) {
    super()
    this.http = createTypedHttp<VfsApp>({
      baseUrl: options.baseUrl,
      fetch: options.fetch,
      middlewares: options.signer ? [signingMiddleware(options.signer)] : undefined,
    })
    this.logger = logger.child({ name: 'HttpFileSystem' })
  }

  override async list(prefix: string): Promise<VirtualEntry[]> {
    const norm = normalizePath(prefix)
    try {
      const { entries } = await this.http.get('/list', { query: { prefix: norm } })
      return entries.map((entry) => (entry.kind === 'dir' ? this.dir(entry.pathname) : this.file(entry.pathname)))
    } catch (e) {
      this.logger.warn(`list(${prefix}) failed:`, e)
      return []
    }
  }

  override async read(pathname: string): Promise<Uint8Array> {
    try {
      return new Uint8Array(await this.http.get('/read', { query: { path: pathname } }))
    } catch (e) {
      if (isHttpError(e, 404)) throw fileNotFound(pathname)
      throw e
    }
  }

  override async readable(pathname: string): Promise<ReadableStream<Uint8Array>> {
    // The typed client buffers responses, so there's no lazy stream to forward — read the whole file
    // and hand back a single-chunk stream (consistent with writable(), which also buffers).
    const bytes = await this.read(pathname)
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    })
  }

  override async write(pathname: string, content: Uint8Array): Promise<void> {
    // Fresh ArrayBuffer-backed view (TS 6 / node 25 typed-array generics).
    await this.http.put('/write', new Uint8Array(content), { query: { path: pathname } })
  }

  override async writable(pathname: string): Promise<WritableStream<Uint8Array>> {
    const chunks: Uint8Array[] = []
    const write = (content: Uint8Array) => this.write(pathname, content)
    return new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk)
      },
      async close() {
        const total = chunks.reduce((n, c) => n + c.length, 0)
        const all = new Uint8Array(total)
        let offset = 0
        for (const chunk of chunks) {
          all.set(chunk, offset)
          offset += chunk.length
        }
        await write(all)
      },
    })
  }

  override async delete(pathname: string, options?: DeleteOptions): Promise<void> {
    try {
      await this.http.delete('/delete', {
        query: { path: pathname, force: options?.force ? '1' : '0', recursive: options?.recursive ? '1' : '0' },
      })
    } catch (e) {
      // force means "best effort": a missing file (or any failure) is not an error.
      if (options?.force) return
      if (isHttpError(e, 404)) throw fileNotFound(pathname)
      throw e
    }
  }

  override async exists(pathname: string): Promise<boolean> {
    try {
      const { exists } = await this.http.get('/exists', { query: { path: pathname } })
      return exists
    } catch (e) {
      this.logger.warn(`exists(${pathname}) failed:`, e)
      return false
    }
  }

  override async head(pathname: string): Promise<FileHead> {
    try {
      return await this.http.get('/head', { query: { path: pathname } })
    } catch (e) {
      if (isHttpError(e, 404)) throw fileNotFound(pathname)
      throw e
    }
  }

  override async lock<T>(_pathname: string, fn: () => Promise<T>): Promise<T> {
    return fn()
  }

  override async acquireLock(_pathname: string): Promise<() => void> {
    return () => {}
  }
}
