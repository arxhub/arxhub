import { normalizePath, posix } from '@arxhub/path'
import { scopeAccessDenied } from './errors'
import { GenericVirtualFileSystem } from './generic-virtual-file-system'
import { matchesScope, type Scope } from './scope'
import type { VirtualEntry } from './virtual-entry'
import type { DeleteOptions, FileHead, VirtualFileSystem } from './virtual-file-system'

// A VirtualFileSystem decorator that (a) roots every operation at `prefix` and (b) optionally enforces
// an allow/deny `scope`. Callers see paths relative to the prefix; the prefix is invisible to them and
// `..` traversal that would escape it is rejected. `file()`/`dir()`/`walk()` are inherited from
// GenericVirtualFileSystem and therefore operate in this scoped (prefix-relative) space automatically.
export class ScopedFileSystem extends GenericVirtualFileSystem {
  private readonly inner: VirtualFileSystem
  private readonly base: string
  private readonly scope?: Scope

  constructor(inner: VirtualFileSystem, prefix: string, scope?: Scope) {
    super()
    this.inner = inner
    this.base = normalizePath(posix.normalize(normalizePath(prefix) || '.'))
    if (this.base === '.') this.base = ''
    this.scope = scope
  }

  // Prefix-relative path → inner (root-absolute) path. Always guards against prefix escape; only
  // checks the allow/deny scope when `check` is true (listing filters its results instead — see list()).
  private resolve(pathname: string, check: boolean): string {
    const rel = normalizePath(posix.normalize(normalizePath(pathname) || '.'))
    const inner = this.base ? normalizePath(posix.normalize(posix.join(this.base, rel === '.' ? '' : rel))) : rel === '.' ? '' : rel
    if (this.base && inner !== this.base && !inner.startsWith(`${this.base}/`)) throw scopeAccessDenied(pathname)
    if (check && this.scope != null && !matchesScope(inner, this.scope)) throw scopeAccessDenied(pathname)
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
    const entries = await this.inner.list(this.resolve(prefix, false))
    const result: VirtualEntry[] = []
    for (const entry of entries) {
      if (this.scope != null && !matchesScope(entry.pathname, this.scope)) continue
      result.push({ kind: entry.kind, pathname: this.strip(entry.pathname) })
    }
    return result
  }

  // These are `async` (rather than returning the inner promise directly) so a synchronous scope/escape
  // rejection from resolve() surfaces as a rejected promise, not a throw at the call site.
  override async read(pathname: string): Promise<Uint8Array> {
    return this.inner.read(this.resolve(pathname, true))
  }

  override async readable(pathname: string): Promise<ReadableStream<Uint8Array>> {
    return this.inner.readable(this.resolve(pathname, true))
  }

  override async write(pathname: string, content: Uint8Array): Promise<void> {
    return this.inner.write(this.resolve(pathname, true), content)
  }

  override async writable(pathname: string): Promise<WritableStream<Uint8Array>> {
    return this.inner.writable(this.resolve(pathname, true))
  }

  override async delete(pathname: string, options?: DeleteOptions): Promise<void> {
    return this.inner.delete(this.resolve(pathname, true), options)
  }

  override async exists(pathname: string): Promise<boolean> {
    return this.inner.exists(this.resolve(pathname, true))
  }

  override async head(pathname: string): Promise<FileHead> {
    return this.inner.head(this.resolve(pathname, true))
  }

  // Delegate locking to the inner fs so locks are coordinated at the real backend across overlapping
  // scopes (two scoped views over the same root must contend for the same path), not per-decorator.
  override async lock<T>(pathname: string, fn: () => Promise<T>): Promise<T> {
    return this.inner.lock(this.resolve(pathname, true), fn)
  }

  override async acquireLock(pathname: string): Promise<() => void> {
    return this.inner.acquireLock(this.resolve(pathname, true))
  }
}
