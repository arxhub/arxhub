import { isRenameCapable, type RenameCapable } from './capabilities/rename'
import { GenericVirtualFileSystem } from './generic-virtual-file-system'
import { appendEntry } from './ops/append'
import { renameEntry } from './ops/rename'
import { INFO_FILE_SUFFIX, type VfsChange, type VfsWatcher } from './vfs-watcher'
import type { VirtualEntry } from './virtual-entry'
import type { DeleteOptions, FileHead, VirtualFileSystem } from './virtual-file-system'

// A VirtualFileSystem decorator that performs every operation on the wrapped file system and tells a
// VfsWatcher about the ones that changed something. Reads, listings, locks and paths pass through
// untouched, so a caller cannot tell it is there.
//
// It exists so freshness is observed in ONE place. `file()`/`dir()`/`walk()` are inherited from
// GenericVirtualFileSystem and therefore dispatch through this decorator's write/delete, which means
// every writer — an editor's `file.writeText()`, a stream, the explorer — is covered without any of
// them knowing anything is watching.
export class ObservedFileSystem extends GenericVirtualFileSystem {
  protected readonly inner: VirtualFileSystem
  protected readonly watcher: VfsWatcher

  // Use this rather than `new`: rename is a per-backend capability that isRenameCapable() detects by
  // looking for the method, so a decorator over a backend without a native rename must not have one
  // either. renameEntry then falls back to copy + delete *through* this decorator, which is already
  // reported as written + deleted and needs no rename change of its own.
  static wrap(inner: VirtualFileSystem, watcher: VfsWatcher): ObservedFileSystem {
    return isRenameCapable(inner) ? new RenamingObservedFileSystem(inner, watcher) : new ObservedFileSystem(inner, watcher)
  }

  constructor(inner: VirtualFileSystem, watcher: VfsWatcher) {
    super()
    this.inner = inner
    this.watcher = watcher
  }

  protected notify(change: VfsChange): void {
    if (change.pathname.endsWith(INFO_FILE_SUFFIX)) return
    if (change.from?.endsWith(INFO_FILE_SUFFIX) === true) return
    this.watcher.notify(change)
  }

  override async list(prefix: string): Promise<VirtualEntry[]> {
    return this.inner.list(prefix)
  }

  override async read(pathname: string): Promise<Uint8Array> {
    return this.inner.read(pathname)
  }

  override async readable(pathname: string): Promise<ReadableStream<Uint8Array>> {
    return this.inner.readable(pathname)
  }

  // Reported only after the inner call resolves: a write that failed changed nothing, and a watcher
  // asked to catch up on it would read the previous content back.
  override async write(pathname: string, content: Uint8Array): Promise<void> {
    await this.inner.write(pathname, content)
    this.notify({ kind: 'written', pathname })
  }

  // Kept append-capable, like ScopedFileSystem: the op re-dispatches at the real backend, so a caller
  // appending through this view still gets a native append where there is one. It lands below the
  // decorator, so the change is reported from here.
  async append(pathname: string, content: Uint8Array): Promise<void> {
    await appendEntry(this.inner, pathname, content)
    this.notify({ kind: 'written', pathname })
  }

  override async writable(pathname: string): Promise<WritableStream<Uint8Array>> {
    const inner = await this.inner.writable(pathname)
    const writer = inner.getWriter()
    const notifyWritten = () => this.notify({ kind: 'written', pathname })
    return new WritableStream<Uint8Array>({
      write(chunk) {
        return writer.write(chunk)
      },
      // On close, not on open: until the stream closes the file does not yet hold what the writer meant
      // to put there. An aborted stream reports nothing.
      async close() {
        await writer.close()
        notifyWritten()
      },
      abort(reason) {
        return writer.abort(reason)
      },
    })
  }

  override async delete(pathname: string, options?: DeleteOptions): Promise<void> {
    await this.inner.delete(pathname, options)
    this.notify({ kind: 'deleted', pathname })
  }

  override async exists(pathname: string): Promise<boolean> {
    return this.inner.exists(pathname)
  }

  override async head(pathname: string): Promise<FileHead> {
    return this.inner.head(pathname)
  }

  // Locks coordinate at the real backend, matching ScopedFileSystem and EncryptingFileSystem: two views
  // over the same store must contend for the same path.
  override async lock<T>(pathname: string, fn: () => Promise<T>): Promise<T> {
    return this.inner.lock(pathname, fn)
  }

  override async acquireLock(pathname: string): Promise<() => void> {
    return this.inner.acquireLock(pathname)
  }
}

// The rename-capable ObservedFileSystem, reachable only through ObservedFileSystem.wrap over a backend
// that renames natively. One 'renamed' change carries both paths, so a subscriber can drop what was at
// the old path without re-reading the store to find out it is gone.
class RenamingObservedFileSystem extends ObservedFileSystem implements RenameCapable {
  async rename(src: string, dest: string): Promise<void> {
    await renameEntry(this.inner, src, dest)
    this.notify({ kind: 'renamed', pathname: dest, from: src })
  }
}
