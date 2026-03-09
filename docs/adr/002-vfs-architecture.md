# ADR 002: VFS Architecture Redesign

## Status
Proposed

## Context

The current VFS (Virtual File System) implementation has state distributed between `GenericFile` and `VirtualFileSystem`, leading to several issues:

1. **Multiple file handles have independent state** - Two `VirtualFile` instances for the same pathname can have different cached data
2. **Stale data problems** - Changes through one handle are not visible through another
3. **Memory leaks** - File handles cache state even when no longer needed
4. **Complex state management** - The `load/flush/dirty` cycle in `GenericFile` is error-prone
5. **Mixed concerns** - Content storage and metadata management are coupled

## Decision

We will redesign the VFS architecture with clean separation:

### 1. Stateless VirtualFile

`VirtualFile` will be a **stateless pointer/handle** to a file. It holds no cached content data and delegates content operations to `VirtualFileSystem`.

```typescript
interface VirtualFile {
  readonly pathname: string
  readonly vfs: VirtualFileSystem
  
  // Access to info (non-async property)
  readonly info: InfoNamespace
  
  // Content operations
  read(): Promise<Uint8Array>
  write(content: Uint8Array, options?: VfsOptions): Promise<void>
  delete(options?: DeleteOptions): Promise<void>
  exists(): Promise<boolean>
}
```

### 2. Content-Only VFS

`VirtualFileSystem` will handle **content operations only**:
- `read` - Read file content
- `write` - Write file content
- `delete` - Delete file
- `list` - List files by prefix
- `exists` - Check file existence
- `head` - Get file metadata (size, timestamps)

### 3. InfoNamespace via VirtualFile

Fields and metadata are accessed through `file.info` (a non-async property) which returns an `InfoNamespace`:

```typescript
interface InfoNamespace {
  // Get single field (async, loads from storage)
  get<K extends string>(key: K): Promise<unknown>
  
  // Get all fields (async, loads from storage)
  getAll(): Promise<Readonly<InfoFields>>
  
  // Set fields (async, with optional buffering)
  set<K extends string>(key: K, value: unknown, options?: VfsOptions): Promise<void>
  set(fields: Partial<InfoFields>, options?: VfsOptions): Promise<void>
  
  // Persistence
  isDirty(): boolean
  flush(): Promise<void>
}

interface InfoFields {
  [key: string]: unknown
}
```

Storage format:
- `/docs/article.md` - Main content
- `/docs/article.md.info` - Fields/metadata (JSON)

## Rationale

The `info` property is accessed **non-async** from the file instance because:
1. Files are just pointers - `vfs.file('/doc.md')` is instant
2. The info namespace reference is created immediately with the file
3. Only the actual data operations (`get`, `set`, `flush`) are async
4. No need for a separate `InfoFileSystem` - info is accessed directly from the file handle

## Consequences

### Positive

1. **Simpler VFS implementations** - Only content operations, no state management
2. **Stateless file handles** - Multiple handles to same file are equivalent
3. **Clear separation** - Content vs metadata are independent
4. **No stale data** - Every read goes directly to storage
5. **Natural API** - `file.info.get('title')` feels intuitive

### Negative

1. **File proliferation** - Each file may have a corresponding `.info` file
2. **Breaking change** - Existing code using `file.mutate.setField()` must migrate
3. **Async info loading** - Fields are not immediately available, must await `get()`

## Migration Path

### Old Pattern
```typescript
const file = vfs.file('/doc.md')
await file.load()
file.mutate.setField('title', 'Hello')
await file.flush()
```

### New Pattern
```typescript
// Content via VFS
const file = vfs.file('/doc.md')  // Non-async, instant
await file.writeText('# Hello World')

// Fields via info namespace (non-async access, async operations)
const title = await file.info.get('title')  // Load from storage
await file.info.set('title', 'Hello World') // Save to storage
await file.info.set({ author: 'John' })     // Batch update
if (file.info.isDirty()) await file.info.flush()
```

## Files Changed

| Package | Modified | Added | Deleted |
|---------|----------|-------|---------|
| `@arxhub/vfs` | `virtual-file.ts`, `virtual-file-system.ts` | `virtual-file-impl.ts`, `info-namespace.ts`, `info-namespace-impl.ts` | `generic-file.ts` |
| `@arxhub/vfs-node` | `node-file-system.ts` | - | - |
| `@arxhub/vfs-browser` | `indexeddb-file-system.ts` | - | - |
| `@arxhub/vfs-tauri` | `tauri-file-system.ts` | - | - |

## API Examples

```typescript
// Create file handle (non-async)
const file = vfs.file('/docs/article.md')

// Read content
const content = await file.readText()

// Access info (non-async property, async operations)
const info = file.info

// Get single field
const title = await info.get('title')

// Get all fields
const fields = await info.getAll()

// Set fields
await info.set('title', 'New Title')
await info.set({ title: 'New', author: 'John', tags: ['tech'] })

// Check dirty and flush
if (info.isDirty()) await info.flush()
```
