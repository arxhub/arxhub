# VFS Refactor Implementation Plan

## Overview

Migrate VFS from stateful `GenericFile` to stateless `VirtualFile` with `info` namespace for fields/metadata.

## Timeline

**Estimated Duration:** 2-3 days
**Priority:** High (blocks other VFS-dependent work)

---

## Phase 1: Interface Updates (Day 1)

### 1.1 Update `@arxhub/vfs` Interfaces

**Files:**
- `packages/vfs/src/virtual-file-system.ts`
- `packages/vfs/src/virtual-file.ts`
- `packages/vfs/src/index.ts`

`FieldsInfoNamespace`, `MetadataInfoNamespace` are extended from `InfoNamespace`

**Tasks:**
- [ ] Remove `getField`, `setField`, `getMetadata`, `setMetadata` from `VirtualFileSystem`
- [ ] Add `fields: FieldsNamespace` property to `VirtualFile`
- [ ] Add `metadata: MetadataNamespace` property to `VirtualFile`
- [ ] Define `InfoNamespace` interface with `get`, `set`, `isDirty`, `flush`
- [ ] Export new interfaces
- [ ] Mark `GenericFile` as `@deprecated`

**Verification:**
```typescript
// Should compile
const file = vfs.file('/test.md')
const info = file.info
```

---

## Phase 2: Core Implementation (Day 1-2)

### 2.1 Create `VirtualFileImpl`

**File:** `packages/vfs/src/virtual-file-impl.ts`

**Tasks:**
- [ ] Implement `VirtualFile` interface
- [ ] Add `read()`, `readText()`, `readJSON()` methods
- [ ] Add `write()`, `writeText()`, `writeJSON()` methods
- [ ] Create `InfoNamespaceImpl` instance in constructor
- [ ] Delegate content operations to `vfs`

**Code Structure:**
```typescript
export class VirtualFileImpl implements VirtualFile {
  readonly pathname: string
  readonly vfs: VirtualFileSystem
  readonly info: InfoNamespace

  constructor(vfs: VirtualFileSystem, pathname: string) {
    this.vfs = vfs
    this.pathname = pathname
    this.info = new InfoNamespaceImpl(this)
  }
  // ... methods
}
```

### 2.2 Create `InfoNamespaceImpl`

**File:** `packages/vfs/src/info-namespace-impl.ts`

**Tasks:**
- [ ] Implement `InfoNamespace` interface
- [ ] Add in-memory cache for fields
- [ ] Implement `get()`, `getAll()` with lazy loading
- [ ] Implement `set()` with batch support
- [ ] Implement `isDirty()` and `flush()`
- [ ] Read/write `.info` files via VFS

**Storage Format:**
```typescript
// /path/to/file.md.info
{
  "title": "Hello World",
  "author": "John",
  "tags": ["tech"]
}
```

---

## Phase 3: VFS Implementations (Day 2)

### 3.1 Update `@arxhub/vfs-node`

**File:** `packages/vfs-node/src/node-file-system.ts`

**Tasks:**
- [ ] Remove fields/metadata methods
- [ ] Use `VirtualFileImpl` in `file()` method
- [ ] Verify content operations still work
- [ ] Update tests

### 3.2 Update `@arxhub/vfs-browser`

**File:** `packages/vfs-browser/src/indexeddb-file-system.ts`

**Tasks:**
- [ ] Remove fields/metadata methods
- [ ] Use `VirtualFileImpl` in `file()` method
- [ ] Verify IndexedDB content operations
- [ ] Update tests

### 3.3 Update `@arxhub/vfs-tauri`

**File:** `packages/vfs-tauri/src/tauri-file-system.ts`

**Tasks:**
- [ ] Remove fields/metadata methods
- [ ] Use `VirtualFileImpl` in `file()` method
- [ ] Verify Tauri API integration
- [ ] Update tests

---

## Phase 4: Consumer Updates (Day 2-3)

### 4.1 Update `@arxhub/sync`

**Files:**
- `packages/sync/src/repo.ts`
- `packages/sync/src/chunker.ts`

**Migration Pattern:**
```typescript
// Before
const file = vfs.file('/doc.md')
await file.load()
file.mutate.setField('title', 'Hello')
await file.flush()

// After
const file = vfs.file('/doc.md')
await file.info.set('title', 'Hello')
```

**Tasks:**
- [ ] Replace `file.mutate.setField` with `file.info.set`
- [ ] Replace `file.fields` access with `file.info.getAll`
- [ ] Remove `await file.load()` calls
- [ ] Update tests

### 4.2 Update `@arxhub/app`

**Tasks:**
- [ ] Search for VFS usage in app code
- [ ] Apply migration pattern
- [ ] Test file operations in UI

---

## Phase 5: Cleanup (Day 3)

### 5.1 Remove Deprecated Code

**File:** `packages/vfs/src/generic-file.ts`

**Tasks:**
- [ ] Delete `GenericFile` class
- [ ] Delete `FileMutations` interface
- [ ] Delete `FileFields` interface (if not used elsewhere)
- [ ] Delete `FileMetadata` interface (if not used elsewhere)

### 5.2 Update Documentation

**Files:**
- `packages/vfs/AGENTS.md`
- `packages/vfs/README.md`

**Tasks:**
- [ ] Update AGENTS.md with new patterns
- [ ] Add migration guide
- [ ] Update code examples

---

## Rollback Plan

If issues are found:

1. **Immediate:** Revert to previous commit
2. **Short-term:** Fix issues in branch, re-merge
3. **Long-term:** Document workarounds for consumers

---

## Testing Checklist

### Unit Tests
- [ ] `VirtualFileImpl` content operations
- [ ] `InfoNamespaceImpl` field operations
- [ ] `InfoNamespaceImpl` flush/dirty tracking
- [ ] `NodeFileSystem` content operations
- [ ] `IndexedDBFileSystem` content operations
- [ ] `TauriFileSystem` content operations

### Integration Tests
- [ ] Create file → write content → read content
- [ ] Create file → set info fields → flush → read info fields
- [ ] Multiple file handles share info state
- [ ] Info file survives app restart (Node.js)

### Migration Tests
- [ ] `@arxhub/sync` tests pass
- [ ] App can read/write files
- [ ] No console errors

---

## Success Criteria

1. All existing tests pass (after migration)
2. New `file.info` API works as documented
3. No references to `GenericFile` or `FileMutations`
4. Documentation updated
5. ADR merged

---

## Related Documents

- `docs/adr/002-vfs-architecture.md` - Architecture decision record
- `packages/vfs/vfs-review.md` - Detailed design document
