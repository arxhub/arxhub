import { ConsoleLogger } from '@arxhub/logger'
import type { RepositoryExtension } from '@arxhub/plugin-repository'
import type { SyncEngine } from '@arxhub/sync'
import { describe, expect, test, vi } from 'vitest'
import { ref } from 'vue'
import { SyncExtension } from '../sync-extension'

function fakeRepository(): RepositoryExtension {
  const storageRevision = ref(0)
  return {
    storageRevision,
    refreshStorage: vi.fn(() => storageRevision.value++),
    refreshPending: vi.fn(async () => {}),
  } as unknown as RepositoryExtension
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
    expect(repository.storageRevision.value).toBe(1)
    expect(repository.refreshStorage).toHaveBeenCalledTimes(1)
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
    expect(repository.storageRevision.value).toBe(1)
    expect(repository.refreshStorage).toHaveBeenCalledTimes(1)
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

describe('downloadVault()', () => {
  const progress = { filesDone: 3, filesTotal: 4, bytesDone: 30, bytesTotal: 40, cloudBytes: 7 }

  // An engine that reports one progress read-out during its round, and can fail the first N rounds.
  function downloadingEngine(opts: { failRounds?: number } = {}) {
    let failRounds = opts.failRounds ?? 0
    let listener: ((p: typeof progress) => void) | null = null
    const added: string[] = []
    const engine = {
      add: async (path: string): Promise<void> => {
        added.push(path)
      },
      events: {
        on: (_event: string, l: (p: typeof progress) => void) => {
          listener = l
          return () => {
            listener = null
          }
        },
      },
      sync: async () => {
        listener?.(progress)
        if (failRounds > 0) {
          failRounds -= 1
          throw new Error('connection lost')
        }
        return { conflicts: [], unresolved: [], decisions: [] }
      },
    } as unknown as SyncEngine
    return { engine, added }
  }

  function hooks() {
    return { finish: vi.fn(async () => {}), retry: vi.fn(async () => {}) }
  }

  test('owes nothing on a boot that is not a join', async () => {
    const sync = extension()
    sync.engine = downloadingEngine().engine
    await sync.downloadVault()
    expect(sync.initialDownload.value.status).toBe('none')
  })

  test('runs a full round, reports its progress and finishes the join once it lands', async () => {
    const sync = extension()
    const { engine, added } = downloadingEngine()
    const h = hooks()
    sync.expectInitialDownload(h)
    expect(sync.initialDownload.value.status).toBe('waiting')
    sync.engine = engine

    await sync.downloadVault()

    expect(added).toContain('vault')
    expect(h.finish).toHaveBeenCalledTimes(1)
    expect(sync.initialDownload.value).toEqual({ status: 'done', progress, error: null })
  })

  test('a failed round leaves the join unfinished, and trying again completes it', async () => {
    const sync = extension()
    const { engine } = downloadingEngine({ failRounds: 1 })
    const h = hooks()
    sync.expectInitialDownload(h)
    sync.engine = engine

    await sync.downloadVault()
    expect(sync.initialDownload.value).toMatchObject({ status: 'failed', error: 'connection lost' })
    expect(h.finish).not.toHaveBeenCalled()

    await sync.downloadVault()
    expect(sync.initialDownload.value.status).toBe('done')
    expect(h.finish).toHaveBeenCalledTimes(1)
  })

  test('a finish that fails is a failed download, not a finished one', async () => {
    const sync = extension()
    const h = hooks()
    h.finish.mockRejectedValueOnce(new Error('config is read-only'))
    sync.expectInitialDownload(h)
    sync.engine = downloadingEngine().engine

    await sync.downloadVault()

    expect(sync.initialDownload.value).toMatchObject({ status: 'failed', error: 'config is read-only' })
  })

  test('without a remote built yet, asks the plugin to bring it up again', async () => {
    const sync = extension()
    const h = hooks()
    sync.expectInitialDownload(h)
    sync.failInitialDownload('Could not read the sync settings')

    await sync.downloadVault()

    expect(h.retry).toHaveBeenCalledTimes(1)
    expect(sync.initialDownload.value.status).toBe('waiting')
  })

  test('owes the first download only until it has landed, so a later remote gets an ordinary full round', async () => {
    const sync = extension()
    expect(sync.owesInitialDownload).toBe(false)
    sync.expectInitialDownload(hooks())
    expect(sync.owesInitialDownload).toBe(true)
    sync.failInitialDownload('connection lost')
    expect(sync.owesInitialDownload).toBe(true)
    sync.engine = downloadingEngine().engine
    await sync.downloadVault()
    expect(sync.initialDownload.value.status).toBe('done')
    expect(sync.owesInitialDownload).toBe(false)
  })

  test('waits for a round already in flight, then runs its own full one', async () => {
    const sync = extension()
    const { engine, added } = downloadingEngine()
    sync.engine = engine
    const timerRound = sync.sync()
    sync.expectInitialDownload(hooks())

    await sync.downloadVault()
    await timerRound

    expect(added.filter((path) => path === 'vault')).toHaveLength(1)
    expect(sync.initialDownload.value.status).toBe('done')
  })
})
