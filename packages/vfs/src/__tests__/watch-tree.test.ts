import { describe, expect, test } from 'vitest'
import type { NativeWatchCapable } from '../capabilities/native-watch'
import { ObservedFileSystem } from '../observed-file-system'
import { watchTree } from '../ops/watch-tree'
import { ScopedFileSystem } from '../scoped-file-system'
import type { VfsChange, VfsChangeListener } from '../vfs-watcher'
import { VfsWatcher } from '../vfs-watcher'
import { MemoryFileSystem } from './memory-file-system'

// A double whose "OS" is just a map of prefix -> listener, fired manually by the test — enough to prove
// the decorators translate prefixes and paths correctly without a real filesystem underneath.
class WatchableMemoryFileSystem extends MemoryFileSystem implements NativeWatchCapable {
  private readonly listeners = new Map<string, VfsChangeListener>()

  async watchTree(prefix: string, listener: VfsChangeListener): Promise<() => void> {
    this.listeners.set(prefix, listener)
    return () => this.listeners.delete(prefix)
  }

  // Fires a change as if the OS reported it, in this backend's own (root) coordinates.
  fire(prefix: string, change: VfsChange): void {
    this.listeners.get(prefix)?.(change)
  }
}

describe('watchTree', () => {
  test('the op returns null on a backend with no native watch', async () => {
    const fs = new MemoryFileSystem()
    expect(await watchTree(fs, '', () => {})).toBeNull()
  })

  test('a scoped view over a capable backend translates the prefix inward and strips its own base back out', async () => {
    const backend = new WatchableMemoryFileSystem()
    // The view is scoped to 'vault'; watching 'notes' inside it should watch 'vault/notes' at the
    // backend, and report paths relative to the VIEW's own base ('vault'), the same way list() does —
    // not relative to the narrower 'notes' prefix that was asked for.
    const vault = new ScopedFileSystem(backend, 'vault')

    const changes: VfsChange[] = []
    const unwatch = await vault.watchTree('notes', (change) => changes.push(change))

    backend.fire('vault/notes', { kind: 'written', pathname: 'vault/notes/a.md' })
    expect(changes).toEqual([{ kind: 'written', pathname: 'notes/a.md' }])

    unwatch()
    backend.fire('vault/notes', { kind: 'written', pathname: 'vault/notes/b.md' })
    expect(changes).toHaveLength(1)
  })

  test('a rename translates both ends', async () => {
    const backend = new WatchableMemoryFileSystem()
    const vault = new ScopedFileSystem(backend, 'vault')

    const changes: VfsChange[] = []
    await vault.watchTree('', (change) => changes.push(change))
    backend.fire('vault', { kind: 'renamed', pathname: 'vault/b.md', from: 'vault/a.md' })

    expect(changes).toEqual([{ kind: 'renamed', pathname: 'b.md', from: 'a.md' }])
  })

  test('a scoped view over an INCAPABLE backend throws rather than silently doing nothing', async () => {
    const vault = new ScopedFileSystem(new MemoryFileSystem(), 'vault')
    await expect(vault.watchTree('', () => {})).rejects.toThrow()
  })

  test('an observed view forwards without rescoping — it does not translate paths', async () => {
    const backend = new WatchableMemoryFileSystem()
    const observed = ObservedFileSystem.wrap(backend, new VfsWatcher())

    const changes: VfsChange[] = []
    await observed.watchTree('vault', (change) => changes.push(change))
    backend.fire('vault', { kind: 'deleted', pathname: 'vault/a.md' })

    expect(changes).toEqual([{ kind: 'deleted', pathname: 'vault/a.md' }])
  })
})
