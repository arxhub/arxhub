import { ConsoleLogger } from '@arxhub/core'
import { contentUrlOf } from '@arxhub/vfs'
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

import { BaseDirectory } from '@tauri-apps/plugin-fs'
import { TauriFileSystem } from '../tauri-file-system'

describe('TauriFileSystem.contentUrl', () => {
  test('a store under the home directory resolves through the asset protocol', async () => {
    const fs = new TauriFileSystem('ArxHub', BaseDirectory.Home, new ConsoleLogger())
    expect(await contentUrlOf(fs, 'vault/clip.mp4')).toBe(`asset://localhost/${encodeURIComponent('/Users/me/ArxHub/vault/clip.mp4')}`)
  })

  test('a store under app data resolves too', async () => {
    const fs = new TauriFileSystem('', BaseDirectory.AppData, new ConsoleLogger())
    expect(await contentUrlOf(fs, 'vault/a.png')).toBe(
      `asset://localhost/${encodeURIComponent('/Users/me/Library/Application Support/org.arxhub/vault/a.png')}`,
    )
  })

  test('a base directory the app never mounts a store under has no URL to give', async () => {
    const fs = new TauriFileSystem('', BaseDirectory.Desktop, new ConsoleLogger())
    expect(await contentUrlOf(fs, 'vault/a.png')).toBeNull()
  })
})
