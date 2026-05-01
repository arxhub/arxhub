# packages/vfs

Virtual file system abstraction. S3-like flat KV storage — paths are keys, not hierarchical directories.

Provides `VirtualFileSystem` interface with platform-specific implementations. File metadata (hash, custom fields) stored in `.info` sidecar files.

## BACKENDS

| Platform | Package | Storage |
|----------|---------|---------|
| Node.js | `@arxhub/vfs-node` | Native filesystem |
| Browser | `@arxhub/vfs-browser` | IndexedDB |
| Tauri | `@arxhub/vfs-tauri` | Native filesystem via Tauri API |

## KEY INTERFACES

```typescript
// Core entry point
interface VirtualFileSystem {
  file<T>(pathname: string): VirtualFile<T>
  dir(pathname: string): VirtualDir
  list(prefix: string): Promise<VirtualEntry[]>
  walk(prefix: string, cursor?: string): VirtualWalker
  read(pathname: string): Promise<Uint8Array>
  write(pathname: string, content: Uint8Array): Promise<void>
  delete(pathname: string, options?: DeleteOptions): Promise<void>
  lock<T>(pathname: string, fn: () => Promise<T>): Promise<T>
}

// File handle (stateless)
interface VirtualFile<T extends Record<string, unknown>> {
  readonly pathname: string
  readonly vfs: VirtualFileSystem
  readonly info: InfoNamespace<T>
  
  readText(): Promise<string>
  readJSON<U>(defaultValue?: U): Promise<U>
  write(content: Uint8Array): Promise<void>
  writeText(content: string): Promise<void>
  writeJSON<U>(content: U): Promise<void>
  delete(options?: DeleteOptions): Promise<void>
  exists(): Promise<boolean>
}

// Directory handle
interface VirtualDir {
  readonly pathname: string
  list(): Promise<VirtualEntry[]>
  walk(cursor?: string): VirtualWalker
}

// Metadata namespace (`.info` sidecar file)
interface InfoNamespace<T> {
  get<K>(key: K): Promise<T[K]>
  getAll(): Promise<T>
  set<K>(key: K, value: T[K], options?: { flush?: boolean }): Promise<void>
  set(fields: Partial<T>, options?: { flush?: boolean }): Promise<void>
  isDirty(): boolean
  flush(): Promise<void>
}

// Cursor-based tree walker
interface VirtualWalker extends AsyncIterable<VirtualFile> {
  hasNext(): Promise<boolean>
  next(): Promise<VirtualFile | null>
  cursor(): string  // Resumable position
}
```

## ARCHITECTURE

### Stateless File Handles

`VirtualFile` and `VirtualDir` are thin wrappers over `VirtualFileSystem`. No internal state. File handles can be discarded and recreated at any time.

```typescript
const file1 = vfs.file('article.md')
const file2 = vfs.file('article.md')
// file1 and file2 are independent instances, safe to use in parallel
```

### Metadata via `.info` Sidecar

All metadata (including hash) stored in `pathname.info` as JSON. Lazy-loaded on first access.

```typescript
const file = vfs.file<{ author?: string, hash?: string }>('article.md')

// Read hash auto-computed on last write
const hash = await file.info.get('hash')

// Custom metadata
await file.info.set('author', 'Alice')
await file.info.set({ author: 'Alice', reviewed: true })

// Batch with flush control (default: auto-flush)
await file.info.set({ draft: false }, { flush: true })

// Check dirty state
if (file.info.isDirty()) {
  await file.info.flush()
}
```

### Automatic Hash Computation

Hash (SHA256) auto-computed on every `write()` and `writable()`. Stored in `info.hash`.

```typescript
await file.writeJSON({ title: 'Hello' })
const hash = await file.info.get('hash')  // Auto-computed
```

### Lock-Based Concurrency

All file operations (read, write, delete) acquire locks to prevent races. Lock is per-pathname.

```typescript
// Atomic read-modify-write
await vfs.lock('article.md', async () => {
  const data = await vfs.read('article.md')
  const updated = mutate(data)
  await vfs.write('article.md', updated)
})

// file.write() and file.writeJSON() lock automatically
```

### Cursor-Based Walking

Walk trees with resumable cursors. Useful for large directory trees.

```typescript
const walker = vfs.walk('/posts')

for await (const file of walker) {
  console.log(file.pathname)
}

// Resume from checkpoint
const checkpoint = walker.cursor()
const walker2 = vfs.walk('/posts', checkpoint)
```

## CONVENTIONS

**VFS is flat KV storage** — paths are keys, directories are prefixes.

- `pathname` = full key: `/foo/bar/baz.txt` (the actual path being accessed)
- `.info` files are hidden: excluded from `list()` and `walk()` results
- Use forward slashes `/` in paths
- Do NOT use Node.js `path` module — use `@arxhub/path` instead

**Example:**
```
/article.md
/article.md.info         (hidden, contains {"hash": "abc123"})
/posts/hello.md
/posts/hello.md.info
/posts/world.md
```

## USAGE PATTERNS

### Reading

```typescript
const file = vfs.file<{ hash?: string }>('article.md')

// Text
const text = await file.readText()

// JSON with fallback
const data = await file.readJSON({ title: 'Default' })

// Raw bytes
const bytes = await file.read()

// Stream (large files)
const stream = await file.readable()
```

### Writing

```typescript
// Text
await file.writeText('Hello')

// JSON
await file.writeJSON({ title: 'Hello', tags: ['vue'] })
  // Automatically pretty-printed (2-space indent)

// Raw bytes
await file.write(new Uint8Array([1, 2, 3]))

// Streams (auto-computes hash)
const writer = await file.writable()
writer.write(chunk1)
writer.write(chunk2)
await writer.close()
```

### Metadata

```typescript
// Custom info fields
interface ArticleInfo {
  hash?: string
  author?: string
  published?: boolean
  tags?: string[]
}

const file = vfs.file<ArticleInfo>('article.md')

// Get one field
const author = await file.info.get('author')

// Get all
const meta = await file.info.getAll()

// Set one field (auto-flushes by default)
await file.info.set('author', 'Alice')

// Set multiple (batch update)
await file.info.set({ author: 'Bob', published: true })

// Manual flush control
await file.info.set('draft', true, { flush: false })
if (someCondition) {
  await file.info.flush()
}
```

### Listing & Walking

```typescript
// List one level (dirs + files, excluding .info)
const entries = await vfs.list('/posts')
// [{ pathname: '/posts/hello.md', kind: 'file' }, ...]

// Walk recursively
const walker = vfs.walk('/posts')
for await (const file of walker) {
  console.log(file.pathname)
}

// Dir handles
const dir = vfs.dir('/posts')
const files = await dir.list()
const walker = dir.walk()
```

### Deletion

```typescript
// Delete file + its .info sidecar (atomic)
await file.delete()

// Dir with options
await vfs.delete('/posts', { recursive: true })
```

## ANTI-PATTERNS

- **Do NOT mutate info in-place** — always use `file.info.set()`. Info namespace is lazy-loaded.
- **Do NOT assume .info exists** — it's created on first `info.set()`. Use a default in `readJSON()`.
- **Do NOT use Node.js `path` module** — use `@arxhub/path` instead. VFS paths are flat keys.
- **Do NOT hold file handles across storage swaps** — `VirtualFile` holds a reference to `VirtualFileSystem`, which is stateful.
- **Do NOT forget locks for read-modify-write** — use `vfs.lock()` for atomic operations.

## STRUCTURE

```
src/
├── virtual-file-system.ts    # VirtualFileSystem interface & types
├── virtual-file.ts           # VirtualFile interface
├── virtual-file-impl.ts      # VirtualFile implementation
├── virtual-dir.ts            # VirtualDir interface
├── virtual-dir-impl.ts       # VirtualDir implementation
├── virtual-entry.ts          # VirtualEntry type (file | dir)
├── virtual-walker.ts         # VirtualWalker interface & implementation
├── info-namespace.ts         # InfoNamespace interface & types
├── info-namespace-impl.ts    # InfoNamespace implementation
├── normalize-path.ts         # Path normalization utilities
├── errors/                   # Error classes
└── index.ts                  # Public exports
```
