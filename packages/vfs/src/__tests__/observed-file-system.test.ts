import { describe, expect, test } from 'vitest'
import { isRenameCapable } from '../capabilities/rename'
import { ObservedFileSystem } from '../observed-file-system'
import { renameEntry } from '../ops/rename'
import type { VfsChange } from '../vfs-watcher'
import { VfsWatcher } from '../vfs-watcher'
import { dec, enc, MemoryFileSystem, RenamingMemoryFileSystem } from './memory-file-system'
import { describeFileSystemContract } from './vfs-contract'

interface Observed {
  fs: ReturnType<typeof ObservedFileSystem.wrap>
  backend: MemoryFileSystem
  changes: VfsChange[]
}

function observe(backend: MemoryFileSystem = new MemoryFileSystem()): Observed {
  const changes: VfsChange[] = []
  const watcher = new VfsWatcher()
  watcher.subscribe((change) => changes.push(change))
  return { fs: ObservedFileSystem.wrap(backend, watcher), backend, changes }
}

// Acceptance criterion 9 / SM-29: the decorator must not change what a file system does. The same suite
// runs against the bare backend and against the decorator over it — a difference in either direction is
// a failure of the decorator, not of the check.
describeFileSystemContract('MemoryFileSystem', () => {
  const backend = new MemoryFileSystem()
  return { fs: backend, backend }
})

describeFileSystemContract('ObservedFileSystem over MemoryFileSystem', () => {
  const { fs, backend } = observe()
  return { fs, backend }
})

describeFileSystemContract('ObservedFileSystem over RenamingMemoryFileSystem', () => {
  const { fs, backend } = observe(new RenamingMemoryFileSystem())
  return { fs, backend }
})

describe('ObservedFileSystem — what it reports', () => {
  test('reports a write once, after it succeeded', async () => {
    const { fs, changes } = observe()

    await fs.write('notes/a.md', enc('hello'))

    expect(changes).toEqual([{ kind: 'written', pathname: 'notes/a.md' }])
  })

  test('reports nothing for a write that failed, and the failure reaches the caller', async () => {
    const { fs, backend, changes } = observe()
    backend.failWriteOn = 'notes/a.md'

    await expect(fs.write('notes/a.md', enc('hello'))).rejects.toThrow()

    expect(changes).toEqual([])
  })

  test('reports a stream when it closes, not when it opens', async () => {
    const { fs, changes } = observe()

    const stream = await fs.writable('notes/a.md')
    const writer = stream.getWriter()
    await writer.write(enc('hello'))
    expect(changes).toEqual([])

    await writer.close()

    expect(changes).toEqual([{ kind: 'written', pathname: 'notes/a.md' }])
    expect(dec(await fs.read('notes/a.md'))).toBe('hello')
  })

  test('reports nothing for a stream that was aborted', async () => {
    const { fs, changes } = observe()

    const stream = await fs.writable('notes/a.md')
    const writer = stream.getWriter()
    await writer.write(enc('half'))
    await writer.abort(new Error('gave up'))

    expect(changes).toEqual([])
  })

  test('reports a delete', async () => {
    const { fs, backend, changes } = observe()
    backend.seed('notes/a.md')

    await fs.delete('notes/a.md')

    expect(changes).toEqual([{ kind: 'deleted', pathname: 'notes/a.md' }])
  })

  test('reports a native rename with both paths', async () => {
    const { fs, backend, changes } = observe(new RenamingMemoryFileSystem())
    backend.seed('notes/a.md', 'hello')

    await renameEntry(fs, 'notes/a.md', 'notes/b.md')

    expect(changes).toEqual([{ kind: 'renamed', pathname: 'notes/b.md', from: 'notes/a.md' }])
  })

  test('offers a logical rename over native and copy/delete backends', () => {
    expect(isRenameCapable(observe(new RenamingMemoryFileSystem()).fs)).toBe(true)
    expect(isRenameCapable(observe().fs)).toBe(true)
  })

  test('reports copied files and one logical rename without a source deletion', async () => {
    const { fs, backend, changes } = observe()
    backend.seed('notes/a.md', 'hello')

    await renameEntry(fs, 'notes/a.md', 'notes/b.md')

    expect(changes).toEqual([
      { kind: 'written', pathname: 'notes/b.md' },
      { kind: 'renamed', pathname: 'notes/b.md', from: 'notes/a.md' },
    ])
  })

  test('a partial copy failure reports completed writes, keeps the source and never announces a rename', async () => {
    const { fs, backend, changes } = observe()
    backend.seed('source/a.md', 'a')
    backend.seed('source/b.md', 'b')
    backend.failWriteOn = 'destination/b.md'

    await expect(renameEntry(fs, 'source', 'destination')).rejects.toThrow()

    expect(dec(await fs.read('source/a.md'))).toBe('a')
    expect(dec(await fs.read('source/b.md'))).toBe('b')
    expect(changes).toEqual([{ kind: 'written', pathname: 'destination/a.md' }])
  })

  test('never reports a metadata sidecar, though the write machinery writes one per save', async () => {
    const { fs, backend, changes } = observe()

    await fs.file('notes/a.md').write(enc('hello'))

    expect(backend.files.has('notes/a.md.arxmeta')).toBe(true)
    expect(changes).toEqual([{ kind: 'written', pathname: 'notes/a.md' }])
  })

  test('a delete through file() reports the content path and not its sidecar', async () => {
    const { fs, changes } = observe()
    await fs.file('notes/a.md').write(enc('hello'))
    changes.length = 0

    await fs.file('notes/a.md').delete()

    expect(changes).toEqual([{ kind: 'deleted', pathname: 'notes/a.md' }])
  })

  test('reports an append as a write', async () => {
    const { fs, changes } = observe()

    await fs.append('log.ndjson', enc('a\n'))

    expect(dec(await fs.read('log.ndjson'))).toBe('a\n')
    expect(changes).toEqual([{ kind: 'written', pathname: 'log.ndjson' }])
  })
})
