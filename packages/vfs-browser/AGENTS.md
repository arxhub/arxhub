# packages/vfs-browser

Browser VFS implementation using IndexedDB. KV storage — flat namespace, not hierarchical.

## STRUCTURE

```
src/
├── indexeddb-file-system.ts  # IndexedDB implementation of VirtualFileSystem
└── index.ts                  # Re-exports
```

## IndexedDBFileSystem

Implements `VirtualFileSystem` using IndexedDB:
- Object store: `files` with keyPath `pathname`
- Values: `{ pathname, content: ArrayBuffer, createdAt, updatedAt }`
- Supports optional prefix for namespacing (e.g., `new IndexedDBFileSystem('repo-1')`)

## CONVENTIONS

- Uses `GenericFile` from `@arxhub/vfs` — no custom VirtualFile subclass needed.
- All paths are keys in a flat namespace (S3-style).
- IndexedDB database name: `arxhub-vfs`
- Store name: `files`

## USAGE

```ts
import { IndexedDBFileSystem } from '@arxhub/vfs-browser'

const vfs = new IndexedDBFileSystem()
const file = vfs.file('notes/2024/jan.md')
await file.writeText('# January')
```

## ANTI-PATTERNS

- Do NOT use outside browser environment — use `@arxhub/vfs-node` for Node.js.
- Do NOT rely on hierarchical directory operations — IndexedDB is KV storage.
- Do NOT store very large files without streaming — memory constraints apply.
