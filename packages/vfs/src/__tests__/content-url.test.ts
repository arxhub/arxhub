import { describe, expect, test } from 'vitest'
import type { ContentUrlCapable } from '../capabilities/content-url'
import { ObservedFileSystem } from '../observed-file-system'
import { contentUrlOf } from '../ops/content-url'
import { ScopedFileSystem } from '../scoped-file-system'
import { VfsWatcher } from '../vfs-watcher'
import { MemoryFileSystem } from './memory-file-system'

class AddressableMemoryFileSystem extends MemoryFileSystem implements ContentUrlCapable {
  readonly asked: string[] = []
  async contentUrl(pathname: string): Promise<string | null> {
    this.asked.push(pathname)
    return `asset://localhost/${pathname}`
  }
}

describe('contentUrlOf', () => {
  test('a backend without the capability answers null, not an error', async () => {
    expect(await contentUrlOf(new MemoryFileSystem(), 'a.png')).toBeNull()
  })

  test('a scoped, observed view asks the backend in the backend’s coordinates', async () => {
    const backend = new AddressableMemoryFileSystem()
    const vault = ObservedFileSystem.wrap(new ScopedFileSystem(backend, 'vault'), new VfsWatcher())

    expect(await contentUrlOf(vault, 'photos/a.png')).toBe('asset://localhost/vault/photos/a.png')
    expect(backend.asked).toEqual(['vault/photos/a.png'])
  })
})
