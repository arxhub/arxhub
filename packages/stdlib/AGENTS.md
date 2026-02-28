# packages/stdlib

Cross-cutting utilities. No external runtime deps. Imported by every other package via subpath: `@arxhub/stdlib/errors/app-error`, `@arxhub/stdlib/collections/lazy-container`, etc.

## STRUCTURE

```
src/
├── collections/
│   ├── container.ts         # Container<T> — typed Map wrapper with KeyError on miss
│   ├── lazy-container.ts    # LazyContainer<T> — factory registry, instantiates on first get()
│   ├── named-container.ts   # NamedContainer<N extends Named> — keyed by .name
│   └── named.ts             # Named interface { readonly name: string }
├── errors/
│   ├── app-error.ts         # AppError base + RenderableError + GenericError types
│   ├── illegal-state-error.ts
│   ├── internal-error.ts
│   ├── key-error.ts
│   └── not-implemented.ts
├── crypto/
│   └── sha256.ts            # sha256(data) → hex string
├── fs/
│   ├── find-longest-prefix.ts   # findLongestPrefix(prefixes, target) — VFS mount resolution
│   ├── is-file-exists.ts
│   ├── list-files.ts            # async generator, BFS directory traversal
│   ├── read-text-file.ts
│   ├── split-pathname.ts        # splitPathname(p) → { path, name, ext }; handles dotfiles
│   └── write-text-file.ts
└── record/
    ├── array-to-record.ts   # arrayToRecord<Named>(arr) → Record<string, T>
    ├── entries.ts           # recordEntries — typed Object.entries
    ├── keys.ts              # recordKeys — typed Object.keys
    └── values.ts            # recordValues — typed Object.values
```

## WHERE TO LOOK

| Need | File |
|------|------|
| New error class | Extend `AppError` in `errors/` |
| Typed key-value store | `Container` or `NamedContainer` |
| Factory/DI registry | `LazyContainer` |
| Path parsing | `split-pathname.ts` |
| VFS mount matching | `find-longest-prefix.ts` |

## CONVENTIONS

- Import via subpath exports: `@arxhub/stdlib/errors/app-error` (not `@arxhub/stdlib`).
- All error classes take descriptive `message` string + `httpStatusCode`.
- `splitPathname` handles dotfiles (`.gitignore` → `{ name: '.gitignore', ext: '' }`).
- `LazyContainer` uses class `.name` as registry key — class names must be unique per container.

## ANTI-PATTERNS

- Do NOT add external runtime deps to stdlib.
- Do NOT add a barrel `index.ts` — subpath imports are intentional for tree-shaking.
- Do NOT throw raw `Error` — always use or extend `AppError`.
