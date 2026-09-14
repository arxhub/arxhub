import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ObservedFileSystem, renameEntry, ScopedFileSystem, VfsWatcher, type VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createIndexQueue, type IndexQueue } from '../index-queue'
import { FakeIndexer, silentLogger } from './fake-indexer'

// The production composition, minus the database: the real Node backend, the real vault scope, the real
// decorator, the real queue. What it proves is the wiring — that a save through the vault view reaches the
// index, that the paths arrive vault-relative (the coordinates the index stores), and that the sidecar the
// write machinery leaves behind never asks for anything.
let rootDir: string
let vault: VirtualFileSystem
let indexer: FakeIndexer
let queue: IndexQueue

const DEBOUNCE_MS = 20

beforeEach(async () => {
  rootDir = await fs.mkdtemp(join(tmpdir(), 'arxhub-freshness-'))
  const logger = silentLogger()
  const watcher = new VfsWatcher()
  vault = ObservedFileSystem.wrap(new ScopedFileSystem(new NodeFileSystem(rootDir, logger), 'vault'), watcher)
  indexer = new FakeIndexer()
  queue = createIndexQueue({ indexer, logger, debounceMs: DEBOUNCE_MS })
  watcher.subscribe((change) => queue.push(change))
})

afterEach(async () => {
  queue.dispose()
  await queue.running?.catch(() => undefined)
  await fs.rm(rootDir, { recursive: true, force: true })
})

describe('vault freshness', () => {
  test('saving a note reindexes it, once', async () => {
    await vault.file('notes/example.md').writeText('# Example\n\nrhinoceros\n')

    await vi.waitFor(() => expect(indexer.indexed).toEqual(['notes/example.md']))
    expect(indexer.removed).toEqual([])
  })

  test('a save through a write stream reindexes on close', async () => {
    const stream = await vault.file('notes/example.md').writable()
    const writer = stream.getWriter()
    await writer.write(new TextEncoder().encode('rhinoceros'))
    expect(indexer.indexed).toEqual([])

    await writer.close()

    await vi.waitFor(() => expect(indexer.indexed).toEqual(['notes/example.md']))
  })

  test('five saves in a row reindex the note once', async () => {
    for (let i = 0; i < 5; i++) await vault.file('notes/example.md').writeText(`revision ${i}\n`)

    await vi.waitFor(() => expect(indexer.indexed).toEqual(['notes/example.md']))
    expect(await vault.file('notes/example.md').readText()).toBe('revision 4\n')
  })

  test('deleting a note drops it from the index', async () => {
    await vault.file('notes/example.md').writeText('rhinoceros\n')
    await queue.flush()
    indexer.indexed.length = 0

    await vault.file('notes/example.md').delete()

    await vi.waitFor(() => expect(indexer.removed).toEqual(['notes/example.md']))
    expect(indexer.indexed).toEqual([])
  })

  test('renaming a note drops the old path and indexes the new one', async () => {
    await vault.file('notes/example.md').writeText('rhinoceros\n')
    await queue.flush()
    indexer.indexed.length = 0

    // The vault view is a scoped view, which has no native rename, so this is copy + delete — and the
    // decorator reports it as the write and delete it really is. Either way the index ends up with the
    // new path and without the old one.
    await renameEntry(vault, 'notes/example.md', 'notes/renamed.md')

    await vi.waitFor(() => {
      expect(indexer.indexed).toEqual(['notes/renamed.md'])
      expect(indexer.removed).toEqual(['notes/example.md'])
    })
  })

  // A folder is not a document, so there is no per-file change to react to: the queue hands the folder's
  // own path to `removePath`, and the engine is what knows to clear everything below it (there is nothing
  // left on disk to walk by the time the change arrives).
  test('deleting a folder hands the folder path to the indexer', async () => {
    await vault.file('notes/archive/one.md').writeText('rhinoceros\n')
    await vault.file('notes/archive/two.md').writeText('rhinoceros\n')
    await queue.flush()
    indexer.indexed.length = 0

    await vault.delete('notes/archive', { recursive: true, force: true })

    await vi.waitFor(() => expect(indexer.removed).toEqual(['notes/archive']))
    expect(indexer.indexed).toEqual([])
  })

  test('a note written outside the vault view is not reported', async () => {
    const root = new NodeFileSystem(rootDir, silentLogger())
    await root.file('storage/config/settings.toml').writeText('x = 1\n')
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS * 3))

    expect(indexer.indexed).toEqual([])
    expect(indexer.removed).toEqual([])
  })
})
