import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ConsoleLogger } from '@arxhub/logger'
import type { KeyringExtension } from '@arxhub/plugin-protection'
import { type ContentMerger, Repo } from '@arxhub/sync'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { describe, expect, test, vi } from 'vitest'
import { RepositoryExtension } from '../repository-extension'
import { REPO_STORE_PATH } from '../store-migration'

// Only the methods the extension actually calls are real — same convention as sync-extension.test.ts's fakeEngine.
// `setContentMerger` records what it was handed, so a test can drive the repo's side of the registry.
type FakeRepo = Repo & { contentMergers: (ContentMerger | null)[] }
function fakeRepo(pending: Set<string> = new Set(), prepare: () => Promise<void> = async () => {}): FakeRepo {
  const contentMergers: (ContentMerger | null)[] = []
  return {
    contentMergers,
    isPending: async (path: string) => pending.has(path),
    pendingPaths: async () => [...pending],
    prepare,
    exclusive: async <T>(work: () => Promise<T>) => work(),
    add: vi.fn(async () => {}),
    setContentMerger: (merger: ContentMerger | null) => {
      contentMergers.push(merger)
    },
  } as unknown as FakeRepo
}

function fakeKeyring(changed = false): KeyringExtension {
  return { owner: async () => (changed ? { changed: true, publicKey: 'k' } : null) } as unknown as KeyringExtension
}

function fakeRootVfs(overrides: Partial<VirtualFileSystem> = {}): VirtualFileSystem {
  return { exists: async () => false, delete: async () => {}, ...overrides } as unknown as VirtualFileSystem
}

function extension(opts: { pending?: Set<string>; changed?: boolean; rootVfs?: VirtualFileSystem; prepare?: () => Promise<void> } = {}) {
  const repo = fakeRepo(opts.pending, opts.prepare)
  const repository = new RepositoryExtension({
    logger: new ConsoleLogger(),
    repo,
    rootVfs: opts.rootVfs ?? fakeRootVfs(),
    keyring: fakeKeyring(opts.changed),
  })
  return Object.assign(repository, { fakeRepo: repo })
}

describe('pending', () => {
  test('starts empty until refreshPending is called', () => {
    expect(extension().pending.value).toEqual(new Set())
  })

  test('a vault path is stripped of its vault/ prefix, and a path outside vault/ is ignored', async () => {
    const repository = extension({ pending: new Set(['vault/notes/a.md', 'vault/deep/nested/b.png', 'storage/whatever.bin']) })
    await repository.refreshPending()
    expect(repository.pending.value).toEqual(new Set(['notes/a.md', 'deep/nested/b.png']))
  })

  test('isPending joins the vault/ prefix before asking the repo', async () => {
    const repository = extension({ pending: new Set(['vault/x.md']) })
    expect(await repository.isPending('x.md')).toBe(true)
    expect(await repository.isPending('y.md')).toBe(false)
  })
})

describe('materializeIfPending', () => {
  test('is a no-op for a path that is not pending, even with no remote registered', async () => {
    const repository = extension()
    await expect(repository.materializeIfPending('x.md')).resolves.toBeUndefined()
  })

  test('refuses with an actionable message when the path is pending but no remote is registered', async () => {
    const repository = extension({ pending: new Set(['vault/x.md']) })
    await expect(repository.materializeIfPending('x.md')).rejects.toThrow('turn sync on')
  })

  test('delegates to the registered remote (repo-relative path) and refreshes pending afterwards', async () => {
    const repository = extension({ pending: new Set(['vault/x.md']) })
    const materialize = vi.fn(async (_path: string) => {})
    repository.setRemote({ fetchFile: async () => {}, fetchChunks: async () => {}, materialize })

    await repository.materializeIfPending('x.md')

    expect(materialize).toHaveBeenCalledWith('vault/x.md')
  })
})

describe('materializeStorageIfPending', () => {
  test('is a no-op when this plugin has no pending storage, even with no remote registered', async () => {
    const prepare = vi.fn(async () => {})
    const repository = extension({ pending: new Set(['storage/other/data.json', 'vault/note.md']), prepare })

    await expect(repository.materializeStorageIfPending('budget')).resolves.toBeUndefined()

    expect(prepare).toHaveBeenCalledTimes(1)
  })

  test('refuses before a plugin can treat pending storage as empty while sync is offline', async () => {
    const repository = extension({ pending: new Set(['storage/budget/budget.jsonl']) })

    await expect(repository.materializeStorageIfPending('budget')).rejects.toThrow('turn sync on')
  })

  test('materializes every pending file in only the requested plugin bucket', async () => {
    const repository = extension({
      pending: new Set([
        'storage/budget/budget.jsonl',
        'storage/budget/conflict-ab12cd34-budget.jsonl',
        'storage/budget-archive/budget.jsonl',
        'storage/other/data.json',
        'vault/note.md',
      ]),
    })
    const materialize = vi.fn(async (_path: string) => {})
    repository.setRemote({ fetchFile: async () => {}, fetchChunks: async () => {}, materialize })

    await repository.materializeStorageIfPending('budget')

    expect(materialize.mock.calls.map(([path]) => path)).toEqual([
      'storage/budget/budget.jsonl',
      'storage/budget/conflict-ab12cd34-budget.jsonl',
    ])
  })

  test.each(['', '.', '..', 'budget/other', 'budget\\other'])('refuses unsafe plugin name %j', async (pluginName) => {
    const repository = extension()
    await expect(repository.materializeStorageIfPending(pluginName)).rejects.toThrow('Invalid plugin name')
  })
})

describe('mutateStorage', () => {
  test('prepares selected metadata without downloading unrelated pending photos', async () => {
    const pending = new Set(['storage/budget/budget.jsonl', 'storage/budget/receipts/remote.jpg'])
    const repository = extension({ pending })
    const materialize = vi.fn(async (path: string) => { pending.delete(path) })
    repository.setRemote({ fetchFile: async () => {}, fetchChunks: async () => {}, materialize })
    const work = vi.fn(async () => 'saved')

    await expect(repository.mutateStorage('budget', work, (path) => path === 'budget.jsonl')).resolves.toBe('saved')
    expect(materialize.mock.calls).toEqual([['storage/budget/budget.jsonl']])
    expect(pending.has('storage/budget/receipts/remote.jpg')).toBe(true)
    expect(work).toHaveBeenCalledTimes(1)
  })

  test('refuses to write if storage became pending between materialisation and taking the repository lock', async () => {
    const repository = extension()
    const pendingPaths = vi
      .spyOn(repository.fakeRepo, 'pendingPaths')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(['storage/budget/budget.jsonl'])
    const work = vi.fn(async () => {})

    await expect(repository.mutateStorage('budget', work)).rejects.toThrow('retry the action')

    expect(pendingPaths).toHaveBeenCalledTimes(2)
    expect(repository.fakeRepo.add).not.toHaveBeenCalled()
    expect(work).not.toHaveBeenCalled()
  })

  test('waits for repository reconciliation, reads its result, and journals the mutation before writing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'arxhub-repository-storage-'))
    try {
      const vfs = new NodeFileSystem(directory, new ConsoleLogger())
      const repo = new Repo(vfs)
      const repository = new RepositoryExtension({ logger: new ConsoleLogger(), repo, rootVfs: vfs, keyring: fakeKeyring() })
      await repository.ready()
      const file = vfs.file('storage/budget/budget.jsonl')
      await file.writeText('A')

      let releaseReconciliation = (): void => {}
      const reconciliationRelease = new Promise<void>((resolve) => {
        releaseReconciliation = resolve
      })
      let reconciliationEntered = (): void => {}
      const reconciliationReady = new Promise<void>((resolve) => {
        reconciliationEntered = resolve
      })
      const reconciliation = repo.exclusive(async () => {
        await file.writeText('B')
        reconciliationEntered()
        await reconciliationRelease
      })
      await reconciliationReady

      const work = vi.fn(async () => {
        expect(await repo.getChangesFile().readJSON<string[]>([])).toEqual(['storage/budget'])
        await file.writeText(`${await file.readText()}C`)
      })
      const mutation = repository.mutateStorage('budget', work)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(work).not.toHaveBeenCalled()

      releaseReconciliation()
      await Promise.all([reconciliation, mutation])

      expect(await file.readText()).toBe('BC')
      expect(await repo.getChangesFile().readJSON<string[]>([])).toEqual(['storage/budget'])
      expect((await repo.snapshot()).files['storage/budget/budget.jsonl']).toBeDefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test.each(['', '.', '..', 'budget/other', 'budget\\other'])('refuses unsafe plugin name %j', async (pluginName) => {
    const repository = extension()
    await expect(repository.mutateStorage(pluginName, async () => {})).rejects.toThrow('Invalid plugin name')
  })
})

describe('ready', () => {
  test('memoises preparation across concurrent callers', async () => {
    const prepare = vi.fn(async () => {})
    const repository = extension({ prepare })

    await Promise.all([repository.ready(), repository.ready()])

    expect(prepare).toHaveBeenCalledTimes(1)
  })

  test('discards the previous owner’s repository state when the identity changed', async () => {
    const del = vi.fn(async () => {})
    const repository = extension({ changed: true, rootVfs: fakeRootVfs({ delete: del }) })

    await repository.ready()

    expect(del).toHaveBeenCalledWith(REPO_STORE_PATH, { recursive: true, force: true })
  })

  test('leaves the store alone when the identity has not changed', async () => {
    const del = vi.fn(async () => {})
    const repository = extension({ changed: false, rootVfs: fakeRootVfs({ delete: del }) })

    await repository.ready()

    expect(del).not.toHaveBeenCalled()
  })
})

describe('registerContentMerger', () => {
  test('the repo is handed ONE merger, at construction, whatever is registered later', () => {
    const repository = extension()
    repository.registerContentMerger({ id: 'a', matches: () => true, merge: async () => null })
    repository.registerContentMerger({ id: 'b', matches: () => true, merge: async () => null })
    expect(repository.fakeRepo.contentMergers).toHaveLength(1)
    expect(typeof repository.fakeRepo.contentMergers[0]).toBe('function')
  })

  test('a registration is reached through the merger the repo holds, with the repo-relative path', async () => {
    const repository = extension()
    const merge = vi.fn<ContentMerger>(async (_path, _base, local) => ({ merged: local, conflicts: 0 }))
    repository.registerContentMerger({ id: 'text', matches: (path) => path.endsWith('.md'), merge })

    const local = new Uint8Array([1])
    const result = await repository.fakeRepo.contentMergers[0]?.('vault/a.md', null, local, new Uint8Array([2]))

    expect(result).toEqual({ merged: local, conflicts: 0 })
    expect(merge.mock.calls[0][0]).toBe('vault/a.md')
  })

  test('a duplicate id is refused, and the returned function frees it', () => {
    const repository = extension()
    const unregister = repository.registerContentMerger({ id: 'arx', matches: () => true, merge: async () => null })
    expect(() => repository.registerContentMerger({ id: 'arx', matches: () => true, merge: async () => null })).toThrow(/arx/)
    unregister()
    expect(() => repository.registerContentMerger({ id: 'arx', matches: () => true, merge: async () => null })).not.toThrow()
  })
})
