import { Extension, type ExtensionArgs } from '@arxhub/core'
import { illegalState } from '@arxhub/errors'
import { join } from '@arxhub/path'
import type { KeyringExtension } from '@arxhub/plugin-protection/ui'
import { FileHistory, type Repo, type Snapshot } from '@arxhub/sync'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { type ShallowRef, shallowRef } from 'vue'
import { type ContentMergerRegistration, ContentMergerRegistry } from './content-mergers'
import { migrateRepositoryStore, REPO_STORE_PATH } from './store-migration'

const VAULT_PREFIX = 'vault/'

// The remote half of the same object — registered by SyncPlugin while it is running (setRemote),
// cleared in its stop(). Kept as this narrow shape rather than a `SyncExtension` import: the
// repository must never know sync exists — Sync depends on Repository, never the other way — so this
// is the one hole through which the remote reaches back in.
export interface RepositoryRemote {
  fetchFile(snapshot: Snapshot, path: string): Promise<void>
  materialize(repoPath: string): Promise<void>
}

export interface RepositoryExtensionArgs extends ExtensionArgs {
  repo: Repo
  rootVfs: VirtualFileSystem
  keyring: KeyringExtension
}

export class RepositoryExtension extends Extension {
  readonly repo: Repo
  readonly history: FileHistory
  // Paths this device left in the cloud, VAULT-relative (the repo's own `vault/` prefix stripped) —
  // what the explorer draws as a phantom node. Refreshed from the repo after every sync round and
  // every materialize() — Sync calls refreshPending() itself; the repository never watches sync.
  readonly pending: ShallowRef<ReadonlySet<string>> = shallowRef(new Set())

  private readonly rootVfs: VirtualFileSystem
  private readonly keyring: KeyringExtension
  private readonly mergers: ContentMergerRegistry
  private remote: RepositoryRemote | null = null
  private preparation: Promise<void> | null = null

  constructor(args: RepositoryExtensionArgs) {
    super(args)
    this.repo = args.repo
    this.rootVfs = args.rootVfs
    this.keyring = args.keyring
    this.mergers = new ContentMergerRegistry(this.logger)
    this.repo.setContentMerger(this.mergers.merge)
    this.history = new FileHistory(
      this.repo,
      () => this.ready(),
      async (snapshot, path) => {
        if (!this.remote) throw illegalState('Connect to the sync server to download this version.')
        await this.remote.fetchFile(snapshot, path)
      },
    )
  }

  // The one registration point for the remote half. Sync sets this while it is running and clears it
  // (null) in its own stop() — every read that needs the remote fails with an actionable message
  // rather than silently pretending the content is here when sync is off.
  setRemote(remote: RepositoryRemote | null): void {
    this.remote = remote
  }

  // The one way a plugin contributes a merge for a format it owns (F-05, `14-sync`); `Repo`'s own slot
  // is taken by the registry at construction and never handed out. Callable in configure(); the
  // returned function unregisters, and a plugin calls it in its stop().
  registerContentMerger(registration: ContentMergerRegistration): () => void {
    return this.mergers.register(registration)
  }

  isPending(vaultPath: string): Promise<boolean> {
    return this.repo.isPending(join('vault', vaultPath))
  }

  async refreshPending(): Promise<void> {
    const paths = await this.repo.pendingPaths()
    const vaultPaths = new Set<string>()
    for (const path of paths) {
      if (!path.startsWith(VAULT_PREFIX)) continue
      vaultPaths.add(path.slice(VAULT_PREFIX.length))
    }
    this.pending.value = vaultPaths
  }

  // What NotesExtension's preparer calls before a pending object opens. A no-op off the pending set;
  // an actionable refusal when there is no remote to fetch from, rather than opening a truncated file.
  async materializeIfPending(vaultPath: string): Promise<void> {
    if (!(await this.isPending(vaultPath))) return
    if (!this.remote) throw illegalState('This file is on the server — turn sync on to open it.')
    await this.remote.materialize(join('vault', vaultPath))
    await this.refreshPending()
  }

  // The store migration, the previous-owner discard and the empty-snapshot seed — memoised, so every
  // caller (FileHistory's `ready`, the Notes preparer via the plugin's own bring-up, a second racing
  // call) awaits the SAME promise and the work underneath runs exactly once.
  ready(): Promise<void> {
    this.preparation ??= this.prepare()
    return this.preparation
  }

  private async prepare(): Promise<void> {
    await migrateRepositoryStore(this.rootVfs, this.logger)
    await this.discardStateOfPreviousIdentity()
    await this.repo.prepare()
  }

  // The repo store — snapshots, chunks and the rollback anchor — belongs to the identity that built
  // it. After the user enters a different recovery phrase the old store is undecryptable and its
  // last-synced anchor points at another owner's history, so rebasing onto it would fail in a way
  // that reads like remote tampering. Dropping it re-enters trust-on-first-sync instead.
  //
  // Whether the identity changed is protection's answer, not the repository's: the same record tells
  // the Security page a reinstall apart from a stranger's phrase, and one owner of that question is
  // enough.
  private async discardStateOfPreviousIdentity(): Promise<void> {
    const owner = await this.keyring.owner()
    if (owner == null || !owner.changed) return

    this.logger.warn('Identity changed since the last run — discarding the previous owner’s repository state')
    try {
      await this.rootVfs.delete(REPO_STORE_PATH, { recursive: true, force: true })
    } catch (error) {
      // Leaving the old store in place would make the next sync fail as if the remote had been
      // tampered with, so say so loudly rather than starting into a confusing failure.
      this.logger.error('Could not discard the previous owner’s repository state', error)
      throw error
    }
  }
}
