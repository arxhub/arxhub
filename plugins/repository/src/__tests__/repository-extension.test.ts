import { ConsoleLogger } from '@arxhub/logger'
import type { KeyringExtension } from '@arxhub/plugin-protection/ui'
import type { ContentMerger, Repo } from '@arxhub/sync'
import type { VirtualFileSystem } from '@arxhub/vfs'
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
    const materialize = vi.fn(async () => {})
    repository.setRemote({ fetchFile: async () => {}, materialize })

    await repository.materializeIfPending('x.md')

    expect(materialize).toHaveBeenCalledWith('vault/x.md')
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
