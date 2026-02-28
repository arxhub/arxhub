# packages/vfs

Virtual file system abstraction. Defines the `VirtualFileSystem` interface and `VirtualFile` interface. Provides `GenericFile` — a concrete `VirtualFile` that delegates all operations back to its owning `VirtualFileSystem`.

## STRUCTURE

```
src/
├── virtual-file-system.ts  # VirtualFileSystem interface
├── virtual-file.ts         # VirtualFile interface
├── generic-file.ts         # GenericFile — base VirtualFile impl, used by all VFS backends
├── errors/
│   ├── file-not-found.ts   # FileNotFound extends AppError (404)
│   ├── mount-not-found.ts  # MountNotFound extends AppError (404)
│   └── index.ts
├── types/
│   ├── delete-options.ts   # { force?, recursive? }
│   └── index.ts
└── index.ts                # Re-exports everything
```

## IMPLEMENTING A NEW VFS BACKEND

1. Implement `VirtualFileSystem` interface (all methods required).
2. Use `GenericFile` for the `file()` factory method:
   ```ts
   file(filename: string): VirtualFile {
     return new GenericFile(this, filename)
   }
   ```
3. `list()` must be an `AsyncGenerator<VirtualFile>`.
4. `readableStream` / `writableStream` return Web Streams API types (`ReadableStream`, `WritableStream`).

## CONVENTIONS

- `pathname` = full path including filename: `/foo/bar/baz.txt`
- `path` = directory only: `/foo/bar`
- `name` = filename without extension: `baz`
- `extension` = extension without dot: `txt`
- `splitPathname` from `@arxhub/stdlib/fs/split-pathname` handles all path parsing.
- `hash(algorithm)` on VirtualFile takes algorithm name string (e.g. `'sha256'`).

## ANTI-PATTERNS

- Do NOT implement a custom `VirtualFile` subclass beyond `GenericFile` unless the backend needs file-specific state.
- Do NOT use Node.js `path` module inside `vfs` — it's an isomorphic package. Use `@arxhub/path` or manual string ops.
- Do NOT throw raw errors — use `FileNotFound` / `MountNotFound` / `AppError` subclasses.
