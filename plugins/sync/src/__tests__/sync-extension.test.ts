import { ConsoleLogger } from '@arxhub/logger'
import type { SyncEngine } from '@arxhub/sync'
import { describe, expect, test } from 'vitest'
import { SyncExtension } from '../sync-extension'

function extension(): SyncExtension {
  return new SyncExtension({ logger: new ConsoleLogger() })
}

// Only the two methods `sync()`/`materialize()` actually call are real.
function fakeEngine(opts: { syncError?: Error } = {}): SyncEngine {
  return {
    add: async (): Promise<void> => {},
    sync: async (): Promise<{ conflicts: string[] }> => {
      if (opts.syncError) throw opts.syncError
      return { conflicts: [] }
    },
    materialize: async (): Promise<void> => {},
  } as unknown as SyncEngine
}

describe('the pending set', () => {
  test('starts empty until a source is wired', () => {
    expect(extension().pending.value).toEqual(new Set())
  })

  test('a vault path is stripped of its vault/ prefix, and a path outside vault/ is ignored', async () => {
    const sync = extension()
    sync.engine = fakeEngine()
    sync.setPendingSource(async () => ['vault/notes/a.md', 'vault/deep/nested/b.png', 'storage/whatever.bin'])

    await sync.materialize('vault/notes/a.md')

    expect(sync.pending.value).toEqual(new Set(['notes/a.md', 'deep/nested/b.png']))
  })

  test('a sync round refreshes the pending set on success', async () => {
    const sync = extension()
    sync.engine = fakeEngine()
    sync.setPendingSource(async () => ['vault/x.md'])

    await sync.sync()

    expect(sync.pending.value).toEqual(new Set(['x.md']))
  })

  // A round that fails partway can still have merged a head that left new files in the cloud, so the
  // set has to be re-read whichever way the round ends.
  test('a sync round refreshes the pending set on failure too', async () => {
    const sync = extension()
    sync.engine = fakeEngine({ syncError: new Error('offline') })
    sync.setPendingSource(async () => ['vault/x.md'])

    await sync.sync()

    expect(sync.status.value).toBe('error')
    expect(sync.pending.value).toEqual(new Set(['x.md']))
  })

  test('with no source wired, materialize and sync leave the pending set alone', async () => {
    const sync = extension()
    sync.engine = fakeEngine()

    await sync.sync()
    await sync.materialize('vault/x.md')

    expect(sync.pending.value).toEqual(new Set())
  })
})
