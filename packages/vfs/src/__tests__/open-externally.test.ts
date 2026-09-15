import { describe, expect, test } from 'vitest'
import type { OpenExternallyCapable } from '../capabilities/open-externally'
import { ObservedFileSystem } from '../observed-file-system'
import { canOpenExternally, openExternally } from '../ops/open-externally'
import { ScopedFileSystem } from '../scoped-file-system'
import { VfsWatcher } from '../vfs-watcher'
import { MemoryFileSystem } from './memory-file-system'

class OpenableMemoryFileSystem extends MemoryFileSystem implements OpenExternallyCapable {
  readonly opened: string[] = []
  async openExternally(pathname: string): Promise<void> {
    this.opened.push(pathname)
  }
}

describe('canOpenExternally / openExternally', () => {
  test('a plain backend has no such capability', async () => {
    const fs = new MemoryFileSystem()
    expect(canOpenExternally(fs)).toBe(false)
    expect(await openExternally(fs, 'a.txt')).toBe(false)
  })

  test('a scoped, observed view over a capable backend reaches it in the backend’s own coordinates', async () => {
    const backend = new OpenableMemoryFileSystem()
    const vault = ObservedFileSystem.wrap(new ScopedFileSystem(backend, 'vault'), new VfsWatcher())

    expect(canOpenExternally(vault)).toBe(true)
    expect(await openExternally(vault, 'a/b.skp')).toBe(true)
    expect(backend.opened).toEqual(['vault/a/b.skp'])
  })

  test('a scoped view over a NON-capable backend answers false synchronously, without reaching for a promise', () => {
    const vault = new ScopedFileSystem(new MemoryFileSystem(), 'vault')
    expect(canOpenExternally(vault)).toBe(false)
  })
})
