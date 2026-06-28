import type { Logger } from '@arxhub/core'
import { createHttpClient, type HttpClient } from '@arxhub/http'
import { normalizePath } from '@arxhub/path'
import {
  type DeleteOptions,
  type FileHead,
  fileNotFound,
  GenericVirtualFileSystem,
  type VirtualEntry,
} from '@arxhub/vfs'
import { type ExistsResponse, type FileHeadResponse, type ListResponse, VFS_DEFAULT_BASE_URL, VFS_ROUTES } from './protocol'

export interface HttpFileSystemOptions {
  // Base URL the server mounts the VFS routes under. Defaults to `/vfs`
  // (same-origin, intended to be reachable through a dev proxy).
  baseUrl?: string
  // Override the fetch implementation (mainly for testing). Defaults to the global fetch.
  fetch?: typeof fetch
}

// VirtualFileSystem backed by an ArxHub server over HTTP (via @arxhub/http).
// Used when the app runs in a plain browser; under Tauri the native filesystem
// is used instead.
//
// Locking cannot span stateless HTTP requests from the browser, so `lock`/
// `acquireLock` run the critical section locally and rely on the server's
// per-request write atomicity.
export class HttpFileSystem extends GenericVirtualFileSystem {
  private readonly http: HttpClient
  private readonly logger: Logger

  constructor(options: HttpFileSystemOptions, logger: Logger) {
    super()
    const baseUrl = (options.baseUrl ?? VFS_DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.http = createHttpClient(baseUrl, { fetch: options.fetch })
    this.logger = logger.child({ name: 'HttpFileSystem' })
  }

  async list(prefix: string): Promise<VirtualEntry[]> {
    const norm = normalizePath(prefix)
    try {
      const data = await this.http.url(VFS_ROUTES.list).query({ prefix: norm }).get().json<ListResponse>()
      return data.entries.map((entry) => (entry.kind === 'dir' ? this.dir(entry.pathname) : this.file(entry.pathname)))
    } catch (e) {
      this.logger.warn(`list(${prefix}) failed:`, e)
      return []
    }
  }

  async read(pathname: string): Promise<Uint8Array> {
    const buffer = await this.http
      .url(VFS_ROUTES.read)
      .query({ path: pathname })
      .get()
      .notFound(() => {
        throw fileNotFound(pathname)
      })
      .arrayBuffer()
    return new Uint8Array(buffer)
  }

  async readable(pathname: string): Promise<ReadableStream<Uint8Array>> {
    const res = await this.http
      .url(VFS_ROUTES.read)
      .query({ path: pathname })
      .get()
      .notFound(() => {
        throw fileNotFound(pathname)
      })
      .res()
    if (res.body == null) throw fileNotFound(pathname)
    return res.body
  }

  async write(pathname: string, content: Uint8Array): Promise<void> {
    await this.http
      .url(VFS_ROUTES.write)
      .query({ path: pathname })
      .content('application/octet-stream')
      // Copy into a fresh ArrayBuffer-backed view (TS 6 / node 25 typed-array generics).
      .body(new Uint8Array(content))
      .put()
      .res()
  }

  async writable(pathname: string): Promise<WritableStream<Uint8Array>> {
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

  async delete(pathname: string, options?: DeleteOptions): Promise<void> {
    const request = this.http
      .url(VFS_ROUTES.delete)
      .query({ path: pathname, force: options?.force ? '1' : '0', recursive: options?.recursive ? '1' : '0' })
      .delete()
    if (options?.force) {
      await request.res().catch(() => undefined)
      return
    }
    await request
      .notFound(() => {
        throw fileNotFound(pathname)
      })
      .res()
  }

  async exists(pathname: string): Promise<boolean> {
    try {
      const data = await this.http.url(VFS_ROUTES.exists).query({ path: pathname }).get().json<ExistsResponse>()
      return data.exists
    } catch (e) {
      this.logger.warn(`exists(${pathname}) failed:`, e)
      return false
    }
  }

  async head(pathname: string): Promise<FileHead> {
    return this.http
      .url(VFS_ROUTES.head)
      .query({ path: pathname })
      .get()
      .notFound(() => {
        throw fileNotFound(pathname)
      })
      .json<FileHeadResponse>()
  }

  async lock<T>(_pathname: string, fn: () => Promise<T>): Promise<T> {
    return fn()
  }

  async acquireLock(_pathname: string): Promise<() => void> {
    return () => {}
  }
}
