import { validation } from '@arxhub/errors'
import { compareAndSwap, type VirtualFile, type VirtualFileSystem } from '@arxhub/vfs'
import { isObjectHash } from './is-object-hash'
import type { SyncRemote } from './sync-remote'

const encodeHead = (hash: string | null): Uint8Array | null => (hash === null ? null : new TextEncoder().encode(hash))

// SyncRemote backed by a VirtualFileSystem. Two homes: the server mounts it over its object store
// (syncRoutes is a thin HTTP skin over this class), and tests/file-based remotes use it directly.
// Layout under the store root: `/head` plus `/objects/<aa>/<bb>/<hash>` (fan-out like git).
export class VfsSyncRemote implements SyncRemote {
  private readonly store: VirtualFileSystem

  constructor(store: VirtualFileSystem) {
    this.store = store
  }

  async getHead(): Promise<string | null> {
    const head = this.store.file('/head')
    if (!(await head.exists())) return null
    const value = (await head.readText()).trim()
    return value === '' ? null : value
  }

  async setHead(expected: string | null, next: string): Promise<boolean> {
    if (!isObjectHash(next)) throw validation(`Invalid head hash: ${next}`)
    // Same compare-and-swap path as the local repo head (`Repo.advanceHead`): one implementation,
    // native on Node (process-wide) and on HTTP (server-side), fallback lock+raw write elsewhere.
    return compareAndSwap(this.store, '/head', encodeHead(expected), encodeHead(next)!)
  }

  async hasObjects(hashes: string[]): Promise<Set<string>> {
    const has = new Set<string>()
    for (const hash of hashes) {
      if (await this.objectFile(hash).exists()) has.add(hash)
    }
    return has
  }

  async getObjects(hashes: string[]): Promise<Map<string, Uint8Array>> {
    const objects = new Map<string, Uint8Array>()
    for (const hash of hashes) {
      const file = this.objectFile(hash)
      if (await file.exists()) objects.set(hash, await file.read())
    }
    return objects
  }

  async putObjects(objects: Map<string, Uint8Array>): Promise<void> {
    for (const [hash, bytes] of objects) {
      await this.objectFile(hash).write(bytes)
    }
  }

  private objectFile(hash: string): VirtualFile {
    // Reject before building a path: on the server this hash arrives from the network.
    if (!isObjectHash(hash)) throw validation(`Invalid object hash: ${hash}`)
    return this.store.file(`/objects/${hash.substring(0, 2)}/${hash.substring(2, 4)}/${hash}`)
  }
}
