import { type RequestSigner, signingMiddleware } from '@arxhub/crypto'
import { createTypedHttp, isHttpError } from '@arxhub/http'
import type { SyncApp } from '../server'
import { decodeObjectFrame } from './decode-object-frame'
import { encodeObjectFrame } from './encode-object-frame'
import type { SyncRemote } from './sync-remote'

export interface HttpSyncRemoteOptions {
  // Where the server mounts the sync routes, e.g. `https://hub.example.com/sync`. Defaults to `/sync`
  // (same-origin, reachable through the dev proxy). This is the mount prefix — route paths are relative.
  baseUrl?: string
  // Override the fetch implementation (mainly for testing). Defaults to the global fetch.
  fetch?: typeof fetch
  // Signs every request with the user's auth key so a protected server accepts it.
  signer?: RequestSigner
}

// SyncRemote over the dedicated sync HTTP routes, typed end-to-end from the server's `SyncApp`: urls,
// bodies and responses are inferred from the Elysia route definitions (no route consts, no DTOs). One
// request moves a whole batch (and carries ONE signature), instead of vfs-http's request-per-file shape.
// Transport errors PROPAGATE — never map a failed call to "empty"/"absent" (HttpFileSystem.list/exists
// did, and a flaky network then looked like an empty remote, which merge happily treats as "everything
// was deleted remotely").
export class HttpSyncRemote implements SyncRemote {
  private readonly http: ReturnType<typeof createTypedHttp<SyncApp>>

  constructor(options: HttpSyncRemoteOptions = {}) {
    this.http = createTypedHttp<SyncApp>({
      baseUrl: options.baseUrl,
      fetch: options.fetch,
      middlewares: options.signer ? [signingMiddleware(options.signer)] : undefined,
    })
  }

  async getHead(): Promise<string | null> {
    return (await this.http.get('/sync/head')).head
  }

  async setHead(expected: string | null, next: string): Promise<boolean> {
    try {
      await this.http.put('/sync/head', { expected, next })
      return true
    } catch (e) {
      // 409 = another device moved the head first; the caller must re-sync, not overwrite.
      if (isHttpError(e, 409)) return false
      throw e
    }
  }

  async hasObjects(hashes: string[]): Promise<Set<string>> {
    if (hashes.length === 0) return new Set()
    const { has } = await this.http.post('/sync/objects/stat', { hashes })
    return new Set(has)
  }

  async getObjects(hashes: string[]): Promise<Map<string, Uint8Array>> {
    if (hashes.length === 0) return new Map()
    const frame = await this.http.post('/sync/objects/get', { hashes })
    return decodeObjectFrame(new Uint8Array(frame))
  }

  async putObjects(objects: Map<string, Uint8Array>): Promise<void> {
    if (objects.size === 0) return
    await this.http.post('/sync/objects/put', encodeObjectFrame(objects))
  }
}
