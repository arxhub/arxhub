import { ConsoleLogger } from '@arxhub/logger'
import type { KeyringExtension } from '@arxhub/plugin-protection/ui'
import type { Repo } from '@arxhub/sync'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { describe, expect, test, vi } from 'vitest'
import { RepositoryExtension } from '../repository-extension'
import { REPO_STORE_PATH } from '../store-migration'

// Only the methods the extension actually calls are real — same convention as sync-extension.test.ts's fakeEngine.
function fakeRepo(pending: Set<string> = new Set(), prepare: () => Promise<void> = async () => {}): Repo {
  return {
    isPending: async (path: string) => pending.has(path),
    pendingPaths: async () => [...pending],
    prepare,
  } as unknown as Repo
}

function fakeKeyring(changed = false): KeyringExtension {
  return { owner: async () => (changed ? { changed: true, publicKey: 'k' } : null) } as unknown as KeyringExtension
}

function fakeRootVfs(overrides: Partial<VirtualFileSystem> = {}): VirtualFileSystem {
  return { exists: async () => false, delete: async () => {}, ...overrides } as unknown as VirtualFileSystem
}

function extension(opts: { pending?: Set<string>; changed?: boolean; rootVfs?: VirtualFileSystem; prepare?: () => Promise<void> } = {}) {
  return new RepositoryExtension({
    logger: new ConsoleLogger(),
    repo: fakeRepo(opts.pending, opts.prepare),
    rootVfs: opts.rootVfs ?? fakeRootVfs(),
    keyring: fakeKeyring(opts.changed),
  })
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
