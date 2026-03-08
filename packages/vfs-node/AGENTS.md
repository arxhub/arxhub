# packages/vfs-node

Node.js Virtual File System implementation. Bridges the VFS abstraction to the Node.js filesystem using `node:fs/promises` and Web Streams API.

## STRUCTURE

```
src/
├── node-file-system.ts  # NodeFileSystem class implementing VirtualFileSystem
└── index.ts             # Re-exports
```

## NodeFileSystem

Implements `VirtualFileSystem` interface using Node.js primitives:
- Reads: `node:fs/promises.readFile()`, `createReadStream()` → Web Streams
- Writes: `node:fs/promises.writeFile()`, `createWriteStream()` → Web Streams
- Listing: `@arxhub/stdlib/fs/list-files` BFS traversal
- Hashing: `node:crypto.createHash()` with streaming read

## CONVENTIONS

- Uses `GenericFile` from `@arxhub/vfs` — no custom VirtualFile subclass needed.
- All paths resolved relative to `rootDir` constructor argument.
- `write()` and `writableStream()` auto-create parent directories via `recursive: true`.
- Web Streams conversion uses `Readable.toWeb()` / `Writable.toWeb()` from `node:stream`.
- Hashing streams chunks to avoid loading full files into memory.

## ANTI-PATTERNS

- Do NOT use outside Node.js environment — browser targets should use a different VFS backend.
- Do NOT construct with relative paths that escape the intended root (no sandboxing enforced).
- Do NOT assume `hash()` algorithm availability — delegate to caller to handle unsupported algos.

## USAGE

```ts
import { NodeFileSystem } from '@arxhub/vfs-node'

const vfs = new NodeFileSystem('/data/repos')
const file = vfs.file('notes/2024/jan.md')
await file.write(Buffer.from('# January'))
```
