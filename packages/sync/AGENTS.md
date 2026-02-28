# packages/sync

Offline-first sync engine. Content-defined chunking (Rabin fingerprinting via `rabin-rs`), SHA256 hashing, snapshot-based version history, three-way merge conflict resolution.

## STRUCTURE

```
src/
├── engine.ts      # SyncEngine — orchestrates local↔remote sync
├── repo.ts        # Repo — VFS-backed repository (add, snapshot, merge, download)
├── chunker.ts     # Chunker — Rabin-based content-defined file splitting
├── index.ts       # Exports engine + repo
└── types/
    ├── snapshot.ts     # Snapshot, SnapshotFile, SnapshotFileChunk
    ├── file-status.ts  # FileStatus { pathname, type: created|modified|deleted }
    └── index.ts
__tests__/
├── engine.test.ts
├── chunker.test.ts
└── testdata/           # Binary fixture files for chunker + engine tests
```

## KEY CONCEPTS

**Repo layout on VFS** (relative to root):
```
repo/
├── head              # text file: hash of current HEAD snapshot
├── changes           # JSON: string[] of staged pathnames
├── snapshots/{hash}  # JSON: Snapshot object
└── chunks/{2}/{2}/{rest}  # raw chunk bytes, keyed by SHA256 (split: 2/2/remaining)
```

**Sync flow** (`SyncEngine.sync()`):
1. Pull all remote snapshots into local VFS
2. Take local snapshot → get remote HEAD
3. Find LCA (base) snapshot
4. Three-way merge local + remote changes over base
5. Rebase local HEAD pointer to remote HEAD

**Chunker constants**: min=512KB, max=8MB, bits=21, window=64 (Rabin params).

## CONVENTIONS

- `Repo` requires `prepare()` call before use (initializes head/changes files).
- All VFS operations use `async-lock` to serialize concurrent mutations per key.
- Chunk keys: `chunks/{first2}/{next2}/{remaining}` — mirrors git object storage.
- Tests use `NodeFileSystem` pointing to `__tests__/testdata/` — `beforeEach` deletes and recreates testdata dirs.
- `dayjs` used for snapshot timestamps (unix seconds).

## ANTI-PATTERNS

- Do NOT call `Repo` methods before `prepare()`.
- Do NOT share a single `Rabin` instance across concurrent `split()` calls — `Chunker` uses `AsyncLock` internally, but each `Chunker` instance is single-use per call stack.
- Do NOT load full file into memory when splitting — use the streaming `VirtualFile.readable()` path.
- Encryption is planned but not yet wired in — do NOT skip the lock acquisition in repo methods.
