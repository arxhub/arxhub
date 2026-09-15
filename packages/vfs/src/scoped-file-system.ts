import { illegalState } from '@arxhub/errors'
import { normalizePath, posix } from '@arxhub/path'
import { scopeAccessDenied } from './errors'
import { GenericVirtualFileSystem } from './generic-virtual-file-system'
import { appendEntry } from './ops/append'
import { contentUrlOf } from './ops/content-url'
import { canOpenExternally, openExternally } from './ops/open-externally'
import { readRange } from './ops/read-range'
import { watchTree } from './ops/watch-tree'
import type { VfsChange, VfsChangeListener } from './vfs-watcher'
import type { VirtualEntry } from './virtual-entry'
import type { DeleteOptions, FileHead, VirtualFileSystem } from './virtual-file-system'

// A VirtualFileSystem decorator that roots every operation at `prefix`. Callers see paths relative to
// the prefix; the prefix is invisible to them and `..` traversal that would escape it is rejected.
// `file()`/`dir()`/`walk()` are inherited from GenericVirtualFileSystem and therefore operate in this
// scoped (prefix-relative) space automatically. This is an organizational/hygiene boundary (per-plugin
// home folders, the vault content view) — NOT a security sandbox against malicious in-process code.
export class ScopedFileSystem extends GenericVirtualFileSystem {
  private readonly inner: VirtualFileSystem
  private readonly base: string

  constructor(inner: VirtualFileSystem, prefix: string) {
    super()
    this.inner = inner
    this.base = normalizePath(posix.normalize(normalizePath(prefix) || '.'))
    if (this.base === '.') this.base = ''
  }

  // Prefix-relative path → inner (root-absolute) path, guarding against `..` escape past the prefix.
  private resolve(pathname: string): string {
    const rel = normalizePath(posix.normalize(normalizePath(pathname) || '.'))
    const inner = this.base ? normalizePath(posix.normalize(posix.join(this.base, rel === '.' ? '' : rel))) : rel === '.' ? '' : rel
    if (this.base && inner !== this.base && !inner.startsWith(`${this.base}/`)) throw scopeAccessDenied(pathname)
    return inner
  }

  // Inner (root-absolute) path → prefix-relative path for return to the caller.
  private strip(inner: string): string {
    if (!this.base) return inner
    if (inner === this.base) return ''
    if (inner.startsWith(`${this.base}/`)) return inner.slice(this.base.length + 1)
    return inner
  }

  override async list(prefix: string): Promise<VirtualEntry[]> {
    const entries = await this.inner.list(this.resolve(prefix))
    return entries.map((entry) => ({ kind: entry.kind, pathname: this.strip(entry.pathname) }))
  }

  // These are `async` (rather than returning the inner promise directly) so a synchronous escape
  // rejection from resolve() surfaces as a rejected promise, not a throw at the call site.
  override async read(pathname: string): Promise<Uint8Array> {
    return this.inner.read(this.resolve(pathname))
  }

  override async readable(pathname: string): Promise<ReadableStream<Uint8Array>> {
    return this.inner.readable(this.resolve(pathname))
  }

  // Like `append`: translate, then re-dispatch through the op so native-vs-cut is decided at the real
  // backend, and a scoped view (the vault) is itself range-capable.
  async readRange(pathname: string, offset: number, length?: number): Promise<Uint8Array> {
    return readRange(this.inner, this.resolve(pathname), offset, length)
  }

  async contentUrl(pathname: string): Promise<string | null> {
    return contentUrlOf(this.inner, this.resolve(pathname))
  }

  // Same shape as `contentUrl`: translate, then re-dispatch through the op so the backend that is
  // actually the disk is the one asked. Unlike `contentUrl` there is no null to hand back — a caller that
  // reaches this without checking `canOpenExternally` first (the intended order) gets a thrown refusal
  // rather than a silent no-op that would let the outer op report success for nothing.
  async openExternally(pathname: string): Promise<void> {
    if (!(await openExternally(this.inner, this.resolve(pathname)))) {
      throw illegalState('This store has no way to open a file externally')
    }
  }

  // `canOpenExternally` has no path to resolve — it asks the inner backend directly, which is what lets
  // a scoped vault view over a browser backend answer "no" synchronously, before any await.
  canOpenExternally(): boolean {
    return canOpenExternally(this.inner)
  }

  // Same shape as `contentUrl`/`openExternally`: translate the prefix inward and re-dispatch through the
  // op so the backend that can actually watch is the one asked — a scoped view over a capable backend is
  // itself capable. Every reported path is translated back OUT (`strip`), so a subscriber never learns
  // this view's root-relative coordinates. There is no fallback to "not capable" here, unlike
  // `contentUrl`: a view that turns out to wrap an incapable backend throws, the same refusal
  // `openExternally` gives a caller who skipped `canOpenExternally`.
  async watchTree(prefix: string, listener: VfsChangeListener): Promise<() => void> {
    const unwatch = await watchTree(this.inner, this.resolve(prefix), (change) => listener(this.stripChange(change)))
    if (unwatch == null) throw illegalState('This store has no way to watch for external changes')
    return unwatch
  }

  private stripChange(change: VfsChange): VfsChange {
    return { kind: change.kind, pathname: this.strip(change.pathname), ...(change.from == null ? {} : { from: this.strip(change.from) }) }
  }

  override async write(pathname: string, content: Uint8Array): Promise<void> {
    return this.inner.write(this.resolve(pathname), content)
  }

  // Translate the scoped path, then re-dispatch through the op so native-vs-fallback append is
  // decided at the real backend (e.g. NodeFileSystem's fs.appendFile). Exposing `append` here makes
  // a scoped view (a plugin's home) itself append-capable.
  async append(pathname: string, content: Uint8Array): Promise<void> {
    return appendEntry(this.inner, this.resolve(pathname), content)
  }

  override async writable(pathname: string): Promise<WritableStream<Uint8Array>> {
    return this.inner.writable(this.resolve(pathname))
  }

  override async delete(pathname: string, options?: DeleteOptions): Promise<void> {
    return this.inner.delete(this.resolve(pathname), options)
  }

  override async exists(pathname: string): Promise<boolean> {
    return this.inner.exists(this.resolve(pathname))
  }

  override async head(pathname: string): Promise<FileHead> {
    return this.inner.head(this.resolve(pathname))
  }

  // Delegate locking to the inner fs so locks are coordinated at the real backend across overlapping
  // scopes (two scoped views over the same root must contend for the same path), not per-decorator.
  override async lock<T>(pathname: string, fn: () => Promise<T>): Promise<T> {
    return this.inner.lock(this.resolve(pathname), fn)
  }

  override async acquireLock(pathname: string): Promise<() => void> {
    return this.inner.acquireLock(this.resolve(pathname))
  }
}
