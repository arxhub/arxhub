import { ConsoleLogger } from '@arxhub/core'
import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { Home: 11 },
  exists: vi.fn(),
  rename: vi.fn(),
}))

import { BaseDirectory, exists, rename } from '@tauri-apps/plugin-fs'
import { relocateLegacyStore } from '../legacy-store'

const present = new Set<string>()

describe('relocateLegacyStore', () => {
  beforeEach(() => {
    present.clear()
    vi.mocked(exists).mockReset()
    vi.mocked(rename).mockReset()
    vi.mocked(exists).mockImplementation(async (path) => present.has(String(path)))
  })

  test('moves the old folder when the new one is absent', async () => {
    present.add('.arxhub')
    expect(await relocateLegacyStore('.arxhub', 'ArxHub', BaseDirectory.Home, new ConsoleLogger())).toBe(true)
    expect(rename).toHaveBeenCalledWith('.arxhub', 'ArxHub', { oldPathBaseDir: BaseDirectory.Home, newPathBaseDir: BaseDirectory.Home })
  })

  test('a fresh install has nothing to move', async () => {
    expect(await relocateLegacyStore('.arxhub', 'ArxHub', BaseDirectory.Home, new ConsoleLogger())).toBe(false)
    expect(rename).not.toHaveBeenCalled()
  })

  test('never overwrites a store that already lives at the new name', async () => {
    present.add('.arxhub')
    present.add('ArxHub')
    expect(await relocateLegacyStore('.arxhub', 'ArxHub', BaseDirectory.Home, new ConsoleLogger())).toBe(false)
    expect(rename).not.toHaveBeenCalled()
  })
})
