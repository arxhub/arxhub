import { PluginConfig } from '@arxhub/config'
import { apiBaseUrl, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { MutableRequestSigner } from '@arxhub/crypto'
import { KeyringExtension } from '@arxhub/plugin-protection'
import { RepositoryExtension } from '@arxhub/plugin-repository'
import { SettingsExtension } from '@arxhub/plugin-settings'
import { ShellExtension } from '@arxhub/plugin-shell'
import { EncryptedSyncRemote, HttpSyncRemote, SYNC_NAMESPACE, SyncEngine } from '@arxhub/sync'
import { type Static, Type } from '@sinclair/typebox'
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
  // Serialises boot bring-up and config.watch behind one chain — without it a section save
  // during the first startSync could race setRemote / engine assignment with boot.
  private applying: Promise<void> = Promise.resolve()
  private bringUp: Promise<void> | null = null
  private stopping = false
  // Cleared when config.watch delivers a save while boot tryRead is still in flight (TH-24-01).
  private bootConfigPending = true
  private syncTimer: ReturnType<typeof setInterval> | null = null
  private onVisible: (() => void) | null = null
  // The serverUrl this plugin has already reacted to (attempted, not necessarily succeeded) — null
  // before the first apply. A config write that only touches autoSyncSeconds leaves this unchanged, so
  // it does not tear down and rebuild a working remote just to re-arm a timer.
  private lastServerUrl: string | null = null

  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(SyncExtension, () => ({ repository: ctx.extensions.get(RepositoryExtension) }))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const config = ctx.services.get(PluginConfig)
    const settings = ctx.extensions.get(SettingsExtension)
    settings.register({ id: 'sync', title: 'Sync', schema: SyncConfigSchema, order: 10, config })

    // The server address and the auto-sync cadence both apply without a restart: every write of this
    // section is routed through the same applyConfig() startSync uses on boot.
    config.watch(SyncConfigSchema, (cfg) => {
      this.bootConfigPending = false
      this.queueApplyConfig(ctx, cfg)
    })

    const shell = ctx.extensions.get(ShellExtension)
    const sync = ctx.extensions.get(SyncExtension)

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

  override start(ctx: PluginContext): Promise<void> {
    this.stopping = false
    this.bootConfigPending = true
    this.bringUp = this.startSync(ctx)
    void this.bringUp.catch((error) => {
      const sync = ctx.extensions.get(SyncExtension)
      sync.status.value = 'error'
      sync.lastError.value = error instanceof Error ? error.message : String(error)
      this.logger.error('Could not initialize sync', error)
    })
    return super.start(ctx)
  }

  private async startSync(ctx: PluginContext): Promise<void> {
    const repository = ctx.extensions.get(RepositoryExtension)
    // Sync is the remote half over the local repository — its own bring-up (the store migration, the
    // previous-owner discard, the empty-snapshot seed) has to be done before anything here reads or
    // writes through it.
    await repository.ready()
    if (this.stopping) return
    // tryRead, not read: the product works offline (FR-147), so an unreachable settings store leaves
    // sync idle instead of aborting the whole boot.
    const cfg = await ctx.services.get(PluginConfig).tryRead(SyncConfigSchema)
    if (this.stopping || cfg == null) return
    if (this.bootConfigPending) this.queueApplyConfig(ctx, cfg)
    await this.applying
  }

  private queueApplyConfig(ctx: PluginContext, cfg: Static<typeof SyncConfigSchema>): void {
    this.applying = this.applying.then(
      () => this.applyConfig(ctx, cfg),
      () => this.applyConfig(ctx, cfg),
    )
    this.applying.catch((error) => this.logger.error('Could not apply the new Sync configuration', error))
  }

  // Builds, rebuilds or tears down the live remote — the one place that decision is made, called from
  // startSync on boot and from the config.watch listener in configure() on every later save, so the
  // server address and the auto-sync cadence both apply without a restart.
  private async applyConfig(ctx: PluginContext, cfg: Static<typeof SyncConfigSchema>): Promise<void> {
    if (this.stopping) return
    const repository = ctx.extensions.get(RepositoryExtension)
    const syncExt = ctx.extensions.get(SyncExtension)

    // A write that only touched autoSyncSeconds leaves serverUrl exactly as it was — skip tearing down
    // and rebuilding a working remote just to re-arm a timer. `lastServerUrl` tracks the value already
    // reacted to (attempted, not necessarily successfully), so a repeat write is not a repeat warning.
    if (cfg.serverUrl !== this.lastServerUrl) {
      this.lastServerUrl = cfg.serverUrl
      // Whatever was running (if anything) no longer matches the saved config — rebuilt below, or left
      // off if the new address is empty.
      repository.setRemote(null)
      syncExt.engine = null

      if (cfg.serverUrl) {
        // Sync requires the user's identity: the keyring both encrypts content and authenticates to the
        // (protected) remote. Without it there is no safe way to sync, so we stay idle and surface why.
        const keyring = ctx.extensions.get(KeyringExtension).keyring
        if (keyring == null) {
          this.logger.warn('Sync is configured but no identity is set — add a recovery phrase in Security settings')
        } else {
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

          // Chunk the whole local tree (vault/ + storage/ content) via the root VFS, but keep the repo
          // store in state/ so sync never chunks its own internals (state/ is never synced and is never
          // add()-ed for snapshotting). state/temp exclusion is structural, not a permission check.
          const engine = new SyncEngine({ local: repository.repo, remote })
          syncExt.engine = engine
          // The one registration point for the remote half — cleared in stop() and on the next config
          // change. Everything that reads a pending file (FileHistory, the Notes preparer) goes through
          // this from now on.
          repository.setRemote({
            fetchFile: (snapshot, path) => engine.fetchFile(snapshot, path),
            materialize: (path) => engine.materialize(path),
          })

          // Sync once right away — full, because edits made before this remote existed (or while the
          // app was not running) reached no watcher. sync() self-guards against overlap.
          void syncExt.sync({ full: true })
        }
      }
    }

    this.rearmTimer(syncExt, cfg.autoSyncSeconds)

    // A phone suspends the app instead of closing it, so the interval stops firing while it is in the
    // background and the user comes back to a stale vault. Coming to the foreground is the moment that
    // matters — sync() no-ops if one is already running, and if there is still no engine at all. Set up
    // once for the plugin's whole life: later config writes only change what the next foreground event
    // finds, not whether there is one to listen for.
    if (this.onVisible == null) {
      this.onVisible = () => {
        if (document.visibilityState === 'visible') void syncExt.sync()
      }
      document.addEventListener('visibilitychange', this.onVisible)
    }
  }

  // Clears and, if a cadence is set, restarts the auto-sync interval. Idempotent, so calling it with an
  // unchanged value on every config write (including ones that did not touch autoSyncSeconds) is cheap
  // and harmless.
  private rearmTimer(syncExt: SyncExtension, autoSyncSeconds: number): void {
    if (this.syncTimer != null) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
    if (autoSyncSeconds > 0) {
      this.syncTimer = setInterval(() => void syncExt.sync(), autoSyncSeconds * 1000)
    }
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.stopping = true
    await this.bringUp?.catch(() => {})
    await this.applying.catch(() => {})
    ctx.extensions.get(RepositoryExtension).setRemote(null)
    ctx.extensions.get(SyncExtension).engine = null
    this.lastServerUrl = null
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
