import { decrypt, encrypt } from '@arxhub/crypto'
import { GenericVirtualFileSystem } from './generic-virtual-file-system'
import type { VirtualEntry } from './virtual-entry'
import type { DeleteOptions, FileHead, VirtualFileSystem } from './virtual-file-system'

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

// A VirtualFileSystem decorator that encrypts file CONTENT with AES-256-GCM before it reaches the
// wrapped filesystem and decrypts it on the way back. Pathnames, directory structure, and listings
// pass through unchanged. Wrap a REMOTE store so the remote only ever holds ciphertext blobs, while
// chunk/snapshot names (already content hashes) stay usable for dedup. Content-defined chunking and
// hashing still run on plaintext upstream (in the local Repo), so dedup is unaffected.
//
// `file()`/`dir()`/`walk()` are inherited from GenericVirtualFileSystem and dispatch through this
// decorator's read()/write(), so higher-level helpers (writeJSON/readText/…) are encrypted too.
// `key` must be 32 bytes (AES-256).
export class EncryptingFileSystem extends GenericVirtualFileSystem {
  private readonly inner: VirtualFileSystem
  private readonly key: Uint8Array

  constructor(inner: VirtualFileSystem, key: Uint8Array) {
    super()
    this.inner = inner
    this.key = key
  }

  override async list(prefix: string): Promise<VirtualEntry[]> {
    const entries = await this.inner.list(prefix)
    return entries.map((entry) => ({ kind: entry.kind, pathname: entry.pathname }))
  }

  override async read(pathname: string): Promise<Uint8Array> {
    return decrypt(this.key, await this.inner.read(pathname))
  }

  // GCM authenticates the whole blob, so decryption needs the full ciphertext — there is no safe
  // partial stream. We read+decrypt eagerly and hand back a single-chunk stream. Fine here: sync only
  // streams bounded chunk/snapshot files.
  override async readable(pathname: string): Promise<ReadableStream<Uint8Array>> {
    const bytes = await this.read(pathname)
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    })
  }

  override async write(pathname: string, content: Uint8Array): Promise<void> {
    return this.inner.write(pathname, encrypt(this.key, content))
  }

  // Buffer the written chunks and encrypt the whole payload once on close (same whole-blob constraint
  // as readable()).
  override async writable(pathname: string): Promise<WritableStream<Uint8Array>> {
    const chunks: Uint8Array[] = []
    const write = (content: Uint8Array): Promise<void> => this.write(pathname, content)
    return new WritableStream<Uint8Array>({
      write(chunk) {
        chunks.push(chunk)
      },
      close() {
        return write(concat(chunks))
      },
    })
  }

  override async delete(pathname: string, options?: DeleteOptions): Promise<void> {
    return this.inner.delete(pathname, options)
  }

  override async exists(pathname: string): Promise<boolean> {
    return this.inner.exists(pathname)
  }

  // Size reflects the stored ciphertext (larger than plaintext by the iv+tag overhead). Sync does not
  // rely on remote head sizes for content decisions, so passing it through is correct and cheap.
  override async head(pathname: string): Promise<FileHead> {
    return this.inner.head(pathname)
  }

  // Locks coordinate at the real backend, matching ScopedFileSystem's delegation.
  override async lock<T>(pathname: string, fn: () => Promise<T>): Promise<T> {
    return this.inner.lock(pathname, fn)
  }

  override async acquireLock(pathname: string): Promise<() => void> {
    return this.inner.acquireLock(pathname)
  }
}
