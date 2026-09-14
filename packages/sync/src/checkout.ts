import { createHasher } from '@arxhub/crypto'
import { hasErrorCode } from '@arxhub/errors'
import type { VirtualFile, VirtualFileSystem } from '@arxhub/vfs'

export interface CheckoutEntry {
  size: number
  mtime: number
  hash: string
  // When the stat above was taken. An entry whose mtime falls within RACY_MS of it cannot be trusted
  // on stat alone: with second-resolution timestamps (HFS+, FAT) a second write in the same tick leaves
  // size and mtime identical. Git's index has the same rule for the same reason.
  checkedAt: number
}

export type CheckoutIndex = Record<string, CheckoutEntry>

const RACY_MS = 2000

// What THIS device knows about the working tree: the stat each file had the last time its content hash
// was established. Device-local by nature — the same file materialises with a different mtime on every
// device — which is why it lives beside the repo store and never in the manifest. It replaces the
// `.arxmeta` sidecar as the answer to "has this file changed": the sidecar was written only by our own
// write() and so never noticed an edit made by anything else, while a stat mismatch notices everything
// and costs one read to confirm.
export class Checkout {
  private readonly tree: VirtualFileSystem
  private readonly indexFile: VirtualFile
  private index: CheckoutIndex | null = null
  private dirty = false

  constructor(tree: VirtualFileSystem, indexFile: VirtualFile) {
    this.tree = tree
    this.indexFile = indexFile
  }

  private async load(): Promise<CheckoutIndex> {
    if (this.index == null) this.index = await this.indexFile.readJSON<CheckoutIndex>({})
    return this.index
  }

  // The content hash of the file at `pathname`, or null when there is no such file. Trusts the recorded
  // stat when it still matches and is not racy; reads the file otherwise, and remembers what it found.
  async hashOf(pathname: string): Promise<string | null> {
    const index = await this.load()
    let size: number
    let mtime: number
    try {
      ;({ size, modifiedAt: mtime } = await this.tree.head(pathname))
    } catch (error) {
      if (hasErrorCode(error, 'FileNotFound')) return null
      throw error
    }
    const known = index[pathname]
    if (known != null && known.size === size && known.mtime === mtime && known.mtime + RACY_MS < known.checkedAt) return known.hash

    const hash = await this.digest(pathname)
    index[pathname] = { size, mtime, hash, checkedAt: Date.now() }
    this.dirty = true
    return hash
  }

  // Record a hash this device has just established by writing the content itself — after a merge
  // materialises a file, or after a snapshot chunked one — so the next status trusts the stat.
  async record(pathname: string, hash: string): Promise<void> {
    const index = await this.load()
    const { size, modifiedAt } = await this.tree.head(pathname)
    index[pathname] = { size, mtime: modifiedAt, hash, checkedAt: Date.now() }
    this.dirty = true
  }

  async forget(pathname: string): Promise<void> {
    const index = await this.load()
    if (pathname in index) {
      delete index[pathname]
      this.dirty = true
    }
  }

  async flush(): Promise<void> {
    if (!this.dirty || this.index == null) return
    await this.indexFile.writeJSON(this.index)
    this.dirty = false
  }

  private async digest(pathname: string): Promise<string> {
    const hasher = createHasher('sha256')
    const reader = (await this.tree.readable(pathname)).getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        hasher.update(value)
      }
    } finally {
      reader.releaseLock()
    }
    return hasher.digest('hex')
  }
}
