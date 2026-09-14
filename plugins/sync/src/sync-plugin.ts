import { PluginConfig } from '@arxhub/config'
import { apiBaseUrl, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { MutableRequestSigner } from '@arxhub/crypto'
import { illegalState } from '@arxhub/errors'
import { join } from '@arxhub/path'
import { NotesExtension } from '@arxhub/plugin-notes/ui'
import { KeyringExtension } from '@arxhub/plugin-protection/ui'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { EncryptedSyncRemote, FileHistory, HttpSyncRemote, Repo, SYNC_NAMESPACE, SyncEngine } from '@arxhub/sync'
import { PluginVfs, RootVfs, VaultWatcher } from '@arxhub/vfs'
import { Type } from '@sinclair/typebox'
import { markRaw } from 'vue'
import { manifest } from './manifest'
import { SyncExtension } from './sync-extension'
import SyncActions from './ui/SyncActions.vue'
import SyncStatus from './ui/SyncStatus.vue'

export const SyncConfigSchema = Type.Object({
  // The server ORIGIN (e.g. https://hub.example.com) — the /sync route prefix is appended here.
  serverUrl: Type.String({ title: 'Server URL', description: 'ArxHub server origin, e.g. https://hub.example.com', default: '' }),
  // Auto-sync cadence in seconds. A no-change sync is ~1 request (getHead) and sync() no-ops while one
  // is already running, so polling is cheap; the manual footer button stays for an immediate push.
  // 0 disables the poll (manual-only).
  // Device-local (A-20): a phone on a weak connection must not impose its cadence on a desktop, while
  // the server address means the same thing everywhere and stays shared.
  autoSyncSeconds: Type.Number({
    title: 'Auto-sync interval (seconds)',
    description: '0 to sync manually only',
    default: 30,
    minimum: 0,
    deviceLocal: true,
  }),
})

export class SyncPlugin extends Plugin {
  private repo!: Repo
  private preparation: Promise<void> | null = null
  private bringUp: Promise<void> | null = null
  private stopping = false
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private onVisible: (() => void) | null = null
  private unwatch: (() => void) | null = null

  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(SyncExtension, () => ({}))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const config = ctx.services.get(PluginConfig)
    const settings = ctx.extensions.get(SettingsExtension)
    settings.register({ id: 'sync', title: 'Sync', schema: SyncConfigSchema, order: 10, config })

    const shell = ctx.extensions.get(ShellExtension)
    const sync = ctx.extensions.get(SyncExtension)
    this.repo = new Repo(ctx.services.get(RootVfs), ctx.services.get(PluginVfs).state)

    // Every vault write reaches the journal as it happens, in the repo's coordinates (the watcher speaks
    // vault-relative paths; the repo trees the root). A rename names both ends: the old path has to be
    // seen as gone, the new one as arrived. Listener errors are the watcher's to report, never the
    // writer's to see — and the journal write is fire-and-forget for the same reason.
    this.unwatch = ctx.services.get(VaultWatcher).subscribe((change) => {
      const paths = change.from == null ? [change.pathname] : [change.from, change.pathname]
      for (const path of paths)
        void this.repo.add(join('vault', path)).catch((error) => this.logger.error('Could not journal a vault change', error))
    })
    // A file left in the cloud comes down before whatever opens it mounts; a file that is on disk costs
    // one index lookup here and nothing else. The policy that leaves files in the cloud is not yet
    // surfaced (23-storage-model F-06: a pending file is not in the tree until the explorer learns of
    // it), so today this hook is exercised only by tests and by a store another version left pending.
    const notes = ctx.extensions.get(NotesExtension)
    notes.registerPreparer(async (path) => {
      const full = join('vault', path)
      if (await this.repo.isPending(full)) await sync.materialize(full)
    })
    sync.history = new FileHistory(
      this.repo,
      () => this.prepare(ctx),
      async (snapshot, path) => {
        await this.bringUp
        if (!sync.engine) throw illegalState('Connect to the sync server to download this version.')
        await sync.engine.fetchFile(snapshot, path)
      },
    )
    // Two registrations, because the one component was two things: where sync stands, and what you can
    // tell it to do. The grammar has no word for a widget that is both, and the bar lays the two out on
    // opposite sides.
    //
    // `busy` is what puts a round on the background line. No owner: a sync belongs to the vault, not to
    // any one open object, so there is nowhere for the line to lead — and saying so is the honest answer.
    shell.status.register({
      id: 'arxhub.sync',
      kind: 'status',
      component: markRaw(SyncStatus),
      busy: () => (sync.status.value === 'syncing' ? { label: 'Syncing…' } : null),
    })
    shell.status.register({ id: 'arxhub.sync.actions', kind: 'action', component: markRaw(SyncActions) })
  }

  private prepare(ctx: PluginContext): Promise<void> {
    this.preparation ??= (async () => {
      await this.discardStateOfPreviousIdentity(ctx.services.get(PluginVfs), ctx.extensions.get(KeyringExtension))
      await this.repo.prepare()
    })()
    return this.preparation
  }

  override start(ctx: PluginContext): Promise<void> {
    this.stopping = false
    this.bringUp = this.startSync(ctx)
    void this.bringUp.catch((error) => {
      const sync = ctx.extensions.get(SyncExtension)
      sync.status.value = 'error'
      sync.lastError.value = error instanceof Error ? error.message : String(error)
      this.logger.error('Could not initialize sync history', error)
    })
    return super.start(ctx)
  }

  private async startSync(ctx: PluginContext): Promise<void> {
    await this.prepare(ctx)
    if (this.stopping) return
    // tryRead, not read: the product works offline (FR-147), so an unreachable settings store leaves
    // sync idle instead of aborting the whole boot.
    const cfg = await ctx.services.get(PluginConfig).tryRead(SyncConfigSchema)

    if (this.stopping || cfg == null || !cfg.serverUrl) return

    // Sync requires the user's identity: the keyring both encrypts content and authenticates to the
    // (protected) remote. Without it there is no safe way to sync, so we stay idle and surface why.
    const keyring = ctx.extensions.get(KeyringExtension).keyring
    if (keyring == null) {
      this.logger.warn('Sync is configured but no identity is set — add a recovery phrase in Security settings')
      return
    }

    // Sign remote requests with the same identity so a protected sync server accepts them.
    const signer = new MutableRequestSigner()
    signer.install(keyring)

    // The remote speaks the dedicated batched /sync protocol (NOT per-file VFS routes) and holds
    // only ciphertext: every chunk/snapshot blob is AES-256-GCM encrypted before upload and
    // decrypted on download. Chunking/hashing still run on plaintext locally (in the local Repo),
    // so dedup is unaffected.
    // arxhub mounts the sync object store at /api/<namespace>; the client targets that, paths relative.
    const remoteBaseUrl = apiBaseUrl(cfg.serverUrl, SYNC_NAMESPACE)
    const remote = new EncryptedSyncRemote(new HttpSyncRemote({ baseUrl: remoteBaseUrl, signer }), keyring.encryptionKey)

    const syncExt = ctx.extensions.get(SyncExtension)
    // Chunk the whole local tree (vault/ + storage/ content) via the root VFS, but keep the repo
    // store in state/ so sync never chunks its own internals (state/ is never synced and is never
    // add()-ed for snapshotting). state/temp exclusion is structural, not a permission check.
    syncExt.engine = new SyncEngine({
      local: this.repo,
      remote,
    })

    // Sync once at startup — full, because edits made while the app was not running reached no
    // watcher — then poll the journal so local saves propagate without the manual footer button.
    // sync() self-guards against overlap.
    void syncExt.sync({ full: true })
    if (cfg.autoSyncSeconds > 0) {
      this.syncTimer = setInterval(() => void syncExt.sync(), cfg.autoSyncSeconds * 1000)
    }

    // A phone suspends the app instead of closing it, so the interval stops firing while it is in
    // the background and the user comes back to a stale vault. Coming to the foreground is the
    // moment that matters — sync() no-ops if one is already running.
    this.onVisible = () => {
      if (document.visibilityState === 'visible') void syncExt.sync()
    }
    document.addEventListener('visibilitychange', this.onVisible)
  }

  // The repo store — snapshots, chunks and the rollback anchor — belongs to the identity that built
  // it. After the user enters a different recovery phrase the old store is undecryptable and its
  // last-synced anchor points at another owner's history, so rebasing onto it would fail in a way
  // that reads like remote tampering. Dropping it re-enters trust-on-first-sync instead.
  //
  // Whether the identity changed is protection's answer, not sync's: the same record tells the
  // Security page a reinstall apart from a stranger's phrase, and one owner of that question is
  // enough. Sync used to keep the marker itself in state/sync/identity; protection adopts that file
  // on first read, so an existing device is not mistaken for an unknown owner.
  private async discardStateOfPreviousIdentity(vfs: PluginVfs, keyrings: KeyringExtension): Promise<void> {
    const owner = await keyrings.owner()
    if (owner == null || !owner.changed) return

    this.logger.warn('Identity changed since the last run — discarding the previous owner’s sync state')
    try {
      await vfs.state.delete('/repo', { recursive: true, force: true })
    } catch (error) {
      // Leaving the old store in place would make the next sync fail as if the remote had been
      // tampered with, so say so loudly rather than starting into a confusing failure.
      this.logger.error('Could not discard the previous owner’s sync state', error)
      throw error
    }
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.stopping = true
    await this.bringUp?.catch(() => {})
    this.unwatch?.()
    this.unwatch = null
    if (this.syncTimer != null) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
    if (this.onVisible != null) {
      document.removeEventListener('visibilitychange', this.onVisible)
      this.onVisible = null
    }
    await super.stop(ctx)
  }
}
