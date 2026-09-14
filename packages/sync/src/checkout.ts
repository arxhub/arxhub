import { createHasher } from '@arxhub/crypto'
import { hasErrorCode } from '@arxhub/errors'
import type { FileHead, VirtualFile, VirtualFileSystem } from '@arxhub/vfs'

export interface CheckoutEntry {
  size: number
  mtime: number
  hash: string
  // When the stat above was taken. An entry whose mtime falls within RACY_MS of it cannot be trusted
  // on stat alone: with second-resolution timestamps (HFS+, FAT) a second write in the same tick leaves
  // size and mtime identical. Git's index has the same rule for the same reason.
  checkedAt: number
}

// What is on disk (entries) and what deliberately is not (pending): a path the manifest lists whose
// content this device chose not to hold — 'in the cloud'. Kept apart from entries because the two
// answer different questions: an entry says 'trust this stat', a pending mark says 'do not read the
// absence of this file as its deletion'.
export interface CheckoutIndex {
  entries: Record<string, CheckoutEntry>
  // pathname → the content hash the manifest had when the path was left unmaterialised.
  pending: Record<string, string>
}

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
    if (this.index == null) {
      const raw = await this.indexFile.readJSON<Partial<CheckoutIndex>>({})
      this.index = { entries: raw.entries ?? {}, pending: raw.pending ?? {} }
    }
    return this.index
  }

  // The content hash of the file at `pathname`, or null when there is no such file. Trusts the recorded
  // stat when it still matches and is not racy; reads the file otherwise, and remembers what it found.
  async hashOf(pathname: string): Promise<string | null> {
    const index = await this.load()
    let head: FileHead
    try {
      head = await this.tree.head(pathname)
    } catch (error) {
      if (hasErrorCode(error, 'FileNotFound')) return null
      throw error
    }
    const known = index.entries[pathname]
    if (known != null && known.size === head.size && known.mtime === head.modifiedAt && known.mtime + RACY_MS < known.checkedAt) {
      return known.hash
    }

    const hash = await this.digest(pathname)
    index.entries[pathname] = { size: head.size, mtime: head.modifiedAt, hash, checkedAt: Date.now() }
    this.dirty = true
    return hash
  }

  // Record a hash this device has just established by writing the content itself — after a merge
  // materialises a file, or after a snapshot chunked one — so the next status trusts the stat.
  async record(pathname: string, hash: string): Promise<void> {
    const index = await this.load()
    const { size, modifiedAt } = await this.tree.head(pathname)
    index.entries[pathname] = { size, mtime: modifiedAt, hash, checkedAt: Date.now() }
    this.dirty = true
  }

  async forget(pathname: string): Promise<void> {
    const index = await this.load()
    if (pathname in index.entries) {
      delete index.entries[pathname]
      this.dirty = true
    }
  }

  // Whether this device has ever established a hash for the file on disk — cheap, no stat, no read.
  // What a fetch asks before spending bandwidth on a file the policy would not materialise: one that
  // IS on disk has to be kept up to date whatever the policy says.
  async knows(pathname: string): Promise<boolean> {
    return pathname in (await this.load()).entries
  }

  async isPending(pathname: string): Promise<boolean> {
    return pathname in (await this.load()).pending
  }

  async markPending(pathname: string, hash: string): Promise<void> {
    const index = await this.load()
    if (index.pending[pathname] === hash) return
    index.pending[pathname] = hash
    delete index.entries[pathname]
    this.dirty = true
  }

  async clearPending(pathname: string): Promise<void> {
    const index = await this.load()
    if (pathname in index.pending) {
      delete index.pending[pathname]
      this.dirty = true
    }
  }

  async pendingPaths(): Promise<string[]> {
    return Object.keys((await this.load()).pending)
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
