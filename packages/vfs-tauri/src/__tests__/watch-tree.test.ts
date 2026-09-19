import { ConsoleLogger } from '@arxhub/core'
import type { VfsChange } from '@arxhub/vfs'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
}))
vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: async () => '/Users/me/Library/Application Support/org.arxhub',
  homeDir: async () => '/Users/me',
  join: async (...parts: string[]) => parts.join('/'),
}))
vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 13, Home: 11, Desktop: 6 },
  SeekMode: { Start: 0 },
  mkdir: vi.fn(),
  open: vi.fn(),
  exists: vi.fn(),
  readDir: vi.fn(),
  readFile: vi.fn(),
  remove: vi.fn(),
  stat: vi.fn(),
  writeFile: vi.fn(),
  watch: vi.fn(),
}))
vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn(),
}))

import { BaseDirectory, mkdir, stat, watch } from '@tauri-apps/plugin-fs'
import { TauriFileSystem } from '../tauri-file-system'

// The plugin-fs types aren't exported in a way vitest's mock can reuse, so events are built as plain
// objects shaped like WatchEvent — this is exactly what the Rust side hands the JS callback.
type FakeEvent = { type: unknown; paths: string[]; attrs: null }

function makeFs(): TauriFileSystem {
  return new TauriFileSystem('ArxHub', BaseDirectory.Home, new ConsoleLogger())
}

describe('TauriFileSystem.watchTree', () => {
  test('watches the store-relative path with the debounced options, and returns the plugin’s own unwatch', async () => {
    const unwatchFn = vi.fn()
    vi.mocked(watch).mockResolvedValue(unwatchFn)
    const fs = makeFs()

    const unwatch = await fs.watchTree('vault', () => {})

    expect(mkdir).toHaveBeenCalledWith('ArxHub/vault', { baseDir: BaseDirectory.Home, recursive: true })
    expect(watch).toHaveBeenCalledWith('ArxHub/vault', expect.any(Function), {
      baseDir: BaseDirectory.Home,
      recursive: true,
      delayMs: 300,
    })
    expect(unwatch).toBe(unwatchFn)
  })

  test('create/modify map to written, remove to deleted — paths relative to the watched prefix', async () => {
    let cb!: (event: FakeEvent) => void
    vi.mocked(watch).mockImplementation(async (_paths, callback) => {
      cb = callback as (event: FakeEvent) => void
      return () => {}
    })
    const fs = makeFs()
    const changes: VfsChange[] = []
    await fs.watchTree('vault', (c) => changes.push(c))

    cb({ type: { create: { kind: 'file' } }, paths: ['/Users/me/ArxHub/vault/a.md'], attrs: null })
    cb({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/Users/me/ArxHub/vault/a.md'], attrs: null })
    cb({ type: { remove: { kind: 'file' } }, paths: ['/Users/me/ArxHub/vault/a.md'], attrs: null })

    expect(changes).toEqual([
      { kind: 'written', pathname: 'a.md' },
      { kind: 'written', pathname: 'a.md' },
      { kind: 'deleted', pathname: 'a.md' },
    ])
  })

  test('a folder create/remove is ignored — only files are journal entries', async () => {
    let cb!: (event: FakeEvent) => void
    vi.mocked(watch).mockImplementation(async (_paths, callback) => {
      cb = callback as (event: FakeEvent) => void
      return () => {}
    })
    const fs = makeFs()
    const changes: VfsChange[] = []
    await fs.watchTree('vault', (c) => changes.push(c))

    cb({ type: { create: { kind: 'folder' } }, paths: ['/Users/me/ArxHub/vault/sub'], attrs: null })
    cb({ type: { remove: { kind: 'folder' } }, paths: ['/Users/me/ArxHub/vault/sub'], attrs: null })

    expect(changes).toHaveLength(0)
  })

  test('a rename carrying both ends (mode: both) is reported as delete + write, without a stat', async () => {
    let cb!: (event: FakeEvent) => void
    vi.mocked(watch).mockImplementation(async (_paths, callback) => {
      cb = callback as (event: FakeEvent) => void
      return () => {}
    })
    const fs = makeFs()
    const changes: VfsChange[] = []
    await fs.watchTree('vault', (c) => changes.push(c))

    cb({
      type: { modify: { kind: 'rename', mode: 'both' } },
      paths: ['/Users/me/ArxHub/vault/old.md', '/Users/me/ArxHub/vault/new.md'],
      attrs: null,
    })

    expect(changes).toEqual([
      { kind: 'deleted', pathname: 'old.md' },
      { kind: 'written', pathname: 'new.md' },
    ])
    expect(stat).not.toHaveBeenCalled()
  })

  test('a lone rename end (mode: to/from) falls back to a stat', async () => {
    let cb!: (event: FakeEvent) => void
    vi.mocked(watch).mockImplementation(async (_paths, callback) => {
      cb = callback as (event: FakeEvent) => void
      return () => {}
    })
    vi.mocked(stat).mockImplementation(async (path: unknown) => {
      if (typeof path === 'string' && path.endsWith('gone.md')) throw new Error('ENOENT')
      return { isDirectory: false } as Awaited<ReturnType<typeof stat>>
    })
    const fs = makeFs()
    const changes: VfsChange[] = []
    await fs.watchTree('vault', (c) => changes.push(c))

    cb({ type: { modify: { kind: 'rename', mode: 'to' } }, paths: ['/Users/me/ArxHub/vault/arrived.md'], attrs: null })
    cb({ type: { modify: { kind: 'rename', mode: 'from' } }, paths: ['/Users/me/ArxHub/vault/gone.md'], attrs: null })

    await vi.waitFor(() => expect(changes).toHaveLength(2))
    expect(changes).toEqual([
      { kind: 'written', pathname: 'arrived.md' },
      { kind: 'deleted', pathname: 'gone.md' },
    ])
  })
})
