import { ConsoleLogger } from '@arxhub/core'
import { hasErrorCode } from '@arxhub/errors'
import { canOpenExternally, openExternally } from '@arxhub/vfs'
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
}))
vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn(),
}))

import { BaseDirectory } from '@tauri-apps/plugin-fs'
import { openPath } from '@tauri-apps/plugin-opener'
import { TauriFileSystem } from '../tauri-file-system'

describe('TauriFileSystem.openExternally', () => {
  test('a store under the home directory opens the right absolute path', async () => {
    const fs = new TauriFileSystem('ArxHub', BaseDirectory.Home, new ConsoleLogger())
    expect(await openExternally(fs, 'vault/model.skp')).toBe(true)
    expect(openPath).toHaveBeenCalledWith('/Users/me/ArxHub/vault/model.skp')
  })

  test('a store under app data opens too', async () => {
    const fs = new TauriFileSystem('', BaseDirectory.AppData, new ConsoleLogger())
    expect(await openExternally(fs, 'vault/model.skp')).toBe(true)
    expect(openPath).toHaveBeenCalledWith('/Users/me/Library/Application Support/org.arxhub/vault/model.skp')
  })

  test('a base directory the app never mounts a store under rejects', async () => {
    const fs = new TauriFileSystem('', BaseDirectory.Desktop, new ConsoleLogger())
    await expect(fs.openExternally('vault/model.skp')).rejects.toSatisfy((e) => hasErrorCode(e, 'IllegalStateError'))
  })

  test('canOpenExternally is true for the two stores the app mounts', () => {
    expect(canOpenExternally(new TauriFileSystem('', BaseDirectory.Home, new ConsoleLogger()))).toBe(true)
    expect(canOpenExternally(new TauriFileSystem('', BaseDirectory.AppData, new ConsoleLogger()))).toBe(true)
    expect(canOpenExternally(new TauriFileSystem('', BaseDirectory.Desktop, new ConsoleLogger()))).toBe(false)
  })
})
