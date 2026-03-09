# packages/vfs-tauri

Tauri VFS implementation using native filesystem access via Tauri API.

## STRUCTURE

```
src/
├── tauri-file-system.ts  # Tauri implementation of VirtualFileSystem
└── index.ts              # Re-exports
```

## TauriFileSystem

Implements `VirtualFileSystem` using Tauri's `plugin-fs` API:
- Base directory configurable (default: `BaseDirectory.AppData`)
- Supports subdirectories via optional prefix path

## TAURI CONFIG

Add to `tauri.conf.json`:
```json
{
  "permissions": [
    "fs:default",
    "fs:allow-app-data-read",
    "fs:allow-app-data-write"
  ]
}
```

Or in `capabilities/*.json`:
```json
{
  "permissions": [
    "fs:default",
    "fs:allow-app-data-read",
    "fs:allow-app-data-write"
  ]
}
```

## CONVENTIONS

- Uses `GenericFile` from `@arxhub/vfs` — no custom VirtualFile subclass needed.
- All paths are relative to the configured base directory.
- Default base: `BaseDirectory.AppData` (platform-specific app data folder).

## USAGE

```ts
import { TauriFileSystem } from '@arxhub/vfs-tauri'
import { BaseDirectory } from '@tauri-apps/plugin-fs'

// App data directory
const vfs = new TauriFileSystem()

// Or with subdirectory
const vfs = new TauriFileSystem('repos/my-repo', BaseDirectory.AppData)

const file = vfs.file('notes/2024/jan.md')
await file.writeText('# January')
```

## ANTI-PATTERNS

- Do NOT use outside Tauri environment — use `@arxhub/vfs-browser` for browser.
- Do NOT forget to add `fs:default` permission to Tauri config.
- Do NOT use absolute paths — always use relative paths with `BaseDirectory`.
