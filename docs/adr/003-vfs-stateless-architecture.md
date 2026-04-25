# ADR 003: VFS Stateless Architecture

## Status
Accepted

## Context

ADR 002 proposed a stateless VFS redesign. This ADR records the final implementation decisions made during execution, which diverged from the proposal in several important ways.

Problems with the old `GenericFile`-based architecture:
1. Multiple `VirtualFile` handles for the same path had **independent, unsynchronized caches** (stale data bugs)
2. `load/flush/dirty` lifecycle was error-prone — callers had to remember to `flush()`
3. Backends duck-typed `saveFieldsAndMetadata` — leaky coupling between content and metadata
4. `Buffer` (Node-specific) was used instead of web-standard `Uint8Array`
5. Hash was a backend method using `node:crypto` directly, not abstracted through the monorepo shim

## Decision

### 1. Stateless `VirtualFile<T>` pointer

`VirtualFile<T>` is a pure stateless pointer — no cached content, no load/flush cycle. All content ops delegate directly to `VirtualFileSystem`.

```typescript
interface VirtualFile<T extends Record<string, unknown> = BaseInfoFields> {
  readonly pathname: string
  readonly vfs: VirtualFileSystem
  readonly info: InfoNamespace<T>

  read(): Promise<Uint8Array>
  readable(): Promise<ReadableStream<Uint8Array>>
  readText(): Promise<string>
  readJSON<U>(defaultValue?: U): Promise<U>

  write(content: Uint8Array): Promise<void>
  writable(): Promise<WritableStream<Uint8Array>>
  writeText(content: string): Promise<void>
  writeJSON<U>(content: U): Promise<void>

  delete(options?: DeleteOptions): Promise<void>
  exists(): Promise<boolean>
}
```

### 2. Generic `InfoNamespace<T>` with type-fest

Metadata lives in `{pathname}.info` JSON sidecar files, accessed via `file.info`. The namespace is generic using type-fest `Paths<T>` / `Get<T,K>` / `PartialDeep<T>` for full type safety:

```typescript
interface InfoNamespace<T extends Record<string, unknown> = BaseInfoFields> {
  get<K extends Paths<T>>(key: K): Promise<Get<T, K>>
  getAll(): Promise<Readonly<T>>
  set<K extends Paths<T>>(key: K, value: Get<T, K>, options?: InfoFlushOptions): Promise<void>
  set(fields: PartialDeep<T>, options?: InfoFlushOptions): Promise<void>
  isDirty(): boolean
  flush(): Promise<void>
}
```

Default `flush: true` — every `set()` persists immediately. Pass `{ flush: false }` to batch, then call `flush()` once.

### 3. Hash on write, stored in `.info`

`write()` and `writable()` automatically compute SHA256 and store it in `file.info.get('hash')`. No `hash()` method on `VirtualFile`. Future backends (S3, WebDAV, SFTP) store their server-provided hash directly in `.info` without re-downloading content.

Hash function lives in `@arxhub/crypto/hash` — bundled as `node:crypto` for Node/Tauri, swapped to `crypto-browserify` shim for browser via Vite aliasing.

### 4. Per-path locking via `async-lock`

Every backend holds one `AsyncLock` instance. Two locking primitives:
- `vfs.lock(pathname, fn)` — scoped callback lock (for atomic read-modify-write)
- `vfs.acquireLock(pathname)` — returns release function (for stream-lifetime locks)

`VirtualFileImpl.write()` and `delete()` acquire locks automatically — callers need not manage locks.

### 5. BFS `VfsListCursor` with serializable cursor

`vfs.list(prefix, cursor?)` returns a `VfsListCursor` — an async iterable that supports mid-iteration snapshots:

```typescript
interface VfsListCursor extends AsyncIterable<VirtualFile> {
  cursor(): string  // btoa(JSON.stringify({ queue, pending }))
}
```

Resume an interrupted listing by passing the opaque token back to `list()`. `.info` sidecar files are filtered from results.

### 6. OPFS browser backend (replaces IndexedDB)

`@arxhub/vfs-browser` now uses the Origin Private File System API (`navigator.storage.getDirectory()`). `FileSystemWritableFileStream` is natively a `WritableStream<Uint8Array>` — no adapter needed.

### 7. Web-standard binary types everywhere

All APIs use `Uint8Array` (not `Buffer`). `Buffer extends Uint8Array` so Node.js reads are zero-copy via `new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)`.

## Consequences

### Positive

- No stale data: every content read goes directly to storage
- No manual `load()`/`flush()` for content — write-through by default
- Type-safe metadata: `file.info.get('title')` infers the return type from `T`
- Hash is universal: works for all current and future backends
- BFS cursor enables resumable pagination over large directory trees
- Web Streams API works in browser, Node, and Tauri without adaptation

### Negative

- Two `vfs.file(same path).info` instances have independent in-memory caches (accepted trade-off — metadata is user-controlled, not content)
- OPFS has no `createdAt` — `head().createdAt` equals `modifiedAt` in the browser backend
- `.info` sidecar proliferation: one extra file per content file on disk

## Files Changed

| Package | Modified | Added | Deleted |
|---------|----------|-------|---------|
| `@arxhub/crypto` | `package.json` | `hash.js`, `hash.d.ts` | — |
| `@arxhub/vfs` | `virtual-file.ts`, `virtual-file-system.ts`, `info-namespace.ts`, `index.ts` | `virtual-file-impl.ts`, `info-namespace-impl.ts`, `vfs-list-cursor.ts` | `generic-file.ts`, `types/` |
| `@arxhub/vfs-node` | `node-file-system.ts` | — | — |
| `@arxhub/vfs-browser` | `index.ts`, `package.json` | `opfs-file-system.ts` | `indexeddb-file-system.ts` |
| `@arxhub/vfs-tauri` | `tauri-file-system.ts`, `package.json` | — | — |
| `@arxhub/sync` | `repo.ts`, `engine.ts` | — | — |

## Migration from ADR 002 Pattern

```typescript
// Old (ADR 002 pattern)
const file = vfs.file('/doc.md')
await file.load()
file.mutate.setField('title', 'Hello')
await file.flush()
const hash = await file.hash('sha256')

// New (ADR 003 pattern)
const file = vfs.file<{ title: string }>('/doc.md')
await file.info.set('title', 'Hello')       // auto-persists
const hash = await file.info.get('hash')    // computed on write, stored in .info
```
