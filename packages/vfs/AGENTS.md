# packages/vfs

Virtual file system abstraction. S3-like KV storage — flat namespace, not hierarchical filesystem.

Defines the `VirtualFileSystem` interface and `VirtualFile` interface. Provides `GenericFile` — a concrete `VirtualFile` that delegates all operations back to its owning `VirtualFileSystem`.

## BACKENDS

| Platform | Package | Storage |
|----------|---------|---------|
| Node.js | `@arxhub/vfs-node` | Native filesystem |
| Browser | `@arxhub/vfs-browser` | IndexedDB |
| Tauri | `@arxhub/vfs-tauri` | Native filesystem via Tauri API |

## STRUCTURE

```
src/
├── virtual-file-system.ts  # VirtualFileSystem interface
├── virtual-file.ts         # VirtualFile interface (with readonly fields/metadata)
├── generic-file.ts         # GenericFile impl with mutate namespace + flush
├── errors/
│   ├── file-not-found.ts
│   ├── mount-not-found.ts
│   └── index.ts
├── types/
│   ├── delete-options.ts
│   ├── file-fields.ts      # User-defined fields (title, category, tags, etc.)
│   ├── file-metadata.ts    # System metadata (hash, timestamps, size)
│   └── index.ts
└── index.ts
```

## KEY PATTERN: Readonly Props + Mutate Namespace

All file data is readonly by default (Vue-safe), mutations happen through `file.mutate`:

```typescript
const file = vfs.file('article.md')
await file.load()

// Read (readonly) - safe for Vue templates
console.log(file.fields.title)  // ReadonlyDeep<FileFields>

// Mutate through namespace
file.mutate.setField('title', 'New Title')
file.mutate.setFields({ category: 'tech', tags: ['vue'] })
file.mutate.batch({
  fields: { status: 'published' },
  metadata: { updatedAt: Date.now() }
})

// Explicit flush to disk
if (file.isDirty()) {
  await file.flush()
}
```

## ARCHITECTURE

### In-Memory First
- All fields/metadata live in memory
- Mutations are instant (no disk I/O)
- Dirty flag tracks changes
- Explicit `flush()` for persistence

### Vue Reactivity
- `fields` and `metadata` return `ReadonlyDeep<T>`
- Works with Vue's `reactive()` - triggers updates on mutation
- No proxy overhead for deep reads

### Batch Operations
```typescript
file.mutate.batch({
  fields: { title: 'X', category: 'Y' },
  metadata: { updatedAt: Date.now() }
})
await file.flush()  // Single disk write
```

## CONVENTIONS

**VFS is S3-like KV storage** — flat namespace. Paths are keys.

- `pathname` = full key: `/foo/bar/baz.txt` (treated as flat key)
- `path` = prefix segment: `/foo/bar` (for listing)
- `name` = last segment: `baz.txt`

**Storage by Platform:**
- Browser: IndexedDB
- Tauri: Native filesystem via Tauri API
- Node.js: Native filesystem with `.arxhub-meta.json` sidecars

## ANTI-PATTERNS

- Do NOT mutate `file.fields` directly — use `file.mutate.setField()`
- Do NOT rely on auto-save — call `file.flush()` explicitly
- Do NOT forget `await file.load()` before accessing fields/metadata
- Do NOT use Node.js `path` module inside `vfs` — use `@arxhub/path`
