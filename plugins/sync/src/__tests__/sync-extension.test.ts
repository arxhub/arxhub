import { ConsoleLogger } from '@arxhub/logger'
import type { RepositoryExtension } from '@arxhub/plugin-repository'
import type { SyncEngine } from '@arxhub/sync'
import { describe, expect, test, vi } from 'vitest'
import { SyncExtension } from '../sync-extension'

function fakeRepository(): RepositoryExtension {
  return { refreshPending: vi.fn(async () => {}) } as unknown as RepositoryExtension
}

function extension(repository: RepositoryExtension = fakeRepository()): SyncExtension {
  return new SyncExtension({ logger: new ConsoleLogger(), repository })
}

// Only the three methods `sync()`/`materialize()`/`readRange()` actually call are real.
function fakeEngine(opts: { syncError?: Error } = {}): SyncEngine {
  return {
    add: async (): Promise<void> => {},
    sync: async (): Promise<{ conflicts: string[]; unresolved: never[]; decisions: never[] }> => {
      if (opts.syncError) throw opts.syncError
      return { conflicts: [], unresolved: [], decisions: [] }
    },
    materialize: async (): Promise<void> => {},
    readRange: async (): Promise<Uint8Array> => new Uint8Array(),
  } as unknown as SyncEngine
}

describe('sync()', () => {
  test('is a no-op with no engine wired', async () => {
    const sync = extension()
    await sync.sync()
    expect(sync.status.value).toBe('idle')
  })

  test("refreshes the repository's pending set on success", async () => {
    const repository = fakeRepository()
    const sync = extension(repository)
    sync.engine = fakeEngine()

    await sync.sync()

    expect(sync.status.value).toBe('idle')
    expect(repository.refreshPending).toHaveBeenCalledTimes(1)
  })

  // A round that fails partway can still have merged a head that left new files in the cloud, so the
  // repository has to be asked again whichever way the round ends.
  test("refreshes the repository's pending set on failure too", async () => {
    const repository = fakeRepository()
    const sync = extension(repository)
    sync.engine = fakeEngine({ syncError: new Error('offline') })

    await sync.sync()

    expect(sync.status.value).toBe('error')
    expect(sync.lastError.value).toBe('offline')
    expect(repository.refreshPending).toHaveBeenCalledTimes(1)
  })

  // The guard (`this.status.value === 'syncing'`) is set synchronously in the first line of sync(),
  // so a second call sees it before either round's async work has had a chance to run — no need to
  // let the first round actually finish to prove the second one never touched anything.
  test('does not run a second round while one is in flight', async () => {
    const engine = {
      add: async (): Promise<void> => {},
      sync: () => new Promise<{ conflicts: string[]; unresolved: never[]; decisions: never[] }>(() => {}),
    } as unknown as SyncEngine
    const sync = extension()
    sync.engine = engine

    void sync.sync()
    await sync.sync()

    expect(sync.status.value).toBe('syncing')
  })
})

describe('materialize()', () => {
  test('refuses with no engine wired', async () => {
    const sync = extension()
    await expect(sync.materialize('vault/x.md')).rejects.toThrow()
  })

  test("delegates to the engine and refreshes the repository's pending set", async () => {
    const repository = fakeRepository()
    const sync = extension(repository)
    sync.engine = fakeEngine()

    await sync.materialize('vault/x.md')

    expect(repository.refreshPending).toHaveBeenCalledTimes(1)
  })
})

describe('readRange()', () => {
  test('refuses with no engine wired', async () => {
    const sync = extension()
    await expect(sync.readRange('vault/x.md', 0)).rejects.toThrow()
  })
})
