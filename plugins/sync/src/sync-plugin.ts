import { PluginConfig } from '@arxhub/config'
import { apiBaseUrl, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { MutableRequestSigner } from '@arxhub/crypto'
import { KeyringExtension } from '@arxhub/plugin-protection/ui'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { EncryptedSyncRemote, HttpSyncRemote, Repo, SYNC_NAMESPACE, SyncEngine } from '@arxhub/sync'
import { PluginVfs, RootVfs } from '@arxhub/vfs'
import { Type } from '@sinclair/typebox'
import { markRaw } from 'vue'
import { manifest } from './manifest'
import { SyncExtension } from './sync-extension'
import SyncFooter from './ui/SyncFooter.vue'

export const SyncConfigSchema = Type.Object({
  // The server ORIGIN (e.g. https://hub.example.com) — the /sync route prefix is appended here.
  serverUrl: Type.String({ title: 'Server URL', description: 'ArxHub server origin, e.g. https://hub.example.com', default: '' }),
  // Auto-sync cadence in seconds. A no-change sync is ~1 request (getHead) and sync() no-ops while one
  // is already running, so polling is cheap; the manual footer button stays for an immediate push.
  // 0 disables the poll (manual-only).
  autoSyncSeconds: Type.Number({ title: 'Auto-sync interval (seconds)', description: '0 to sync manually only', default: 30, minimum: 0 }),
})

export class SyncPlugin extends Plugin {
  private syncTimer: ReturnType<typeof setInterval> | null = null

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
    shell.footer.register({ id: 'arxhub.sync', component: markRaw(SyncFooter), region: 'right' })
  }

  override async start(ctx: PluginContext): Promise<void> {
    await super.start(ctx)

    const pluginVfs = ctx.services.get(PluginVfs)
    // tryRead, not read: the product works offline (FR-147), so an unreachable settings store leaves
    // sync idle instead of aborting the whole boot.
    const cfg = await ctx.services.get(PluginConfig).tryRead(SyncConfigSchema)

    if (cfg == null || !cfg.serverUrl) return

    // Sync requires the user's identity: the keyring both encrypts content and authenticates to the
    // (protected) remote. Without it there is no safe way to sync, so we stay idle and surface why.
    const keyring = ctx.extensions.get(KeyringExtension).keyring
    if (keyring == null) {
      this.logger.warn('Sync is configured but no identity is set — add a recovery phrase in Security settings')
      return
    }

    await this.discardStateOfPreviousIdentity(pluginVfs, keyring.authPublicKey)

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
      local: new Repo(ctx.services.get(RootVfs), pluginVfs.state),
      remote,
    })

    // Sync once at startup (pull remote edits made while offline), then poll so local saves
    // propagate without the manual footer button. sync() self-guards against overlap.
    void syncExt.sync()
    if (cfg.autoSyncSeconds > 0) {
      this.syncTimer = setInterval(() => void syncExt.sync(), cfg.autoSyncSeconds * 1000)
    }
  }

  // The repo store — snapshots, chunks and the rollback anchor — belongs to the identity that built
  // it. After the user enters a different recovery phrase the old store is undecryptable and its
  // last-synced anchor points at another owner's history, so rebasing onto it would fail in a way
  // that reads like remote tampering. Dropping it re-enters trust-on-first-sync instead.
  private async discardStateOfPreviousIdentity(vfs: PluginVfs, authPublicKey: string): Promise<void> {
    const owner = vfs.state.file('/identity')

    // An unreadable marker must not keep the app from starting, and it is not evidence of a changed
    // identity either — treat it as unknown and rewrite it.
    let previous: string | null = null
    try {
      previous = (await owner.readJSON<string | null>(null))?.trim() ?? null
    } catch (error) {
      this.logger.warn('Could not read the sync identity marker — rewriting it', error)
    }

    if (previous === authPublicKey) return

    if (previous != null) {
      this.logger.warn('Identity changed since the last run — discarding the previous owner’s sync state')
      try {
        await vfs.state.delete('/repo', { recursive: true, force: true })
      } catch (error) {
        // Leaving the old store in place would make the next sync fail as if the remote had been
        // tampered with, so say so loudly rather than starting into a confusing failure.
        this.logger.error('Could not discard the previous owner’s sync state — sync will likely fail until state/sync/repo is removed', error)
      }
    }

    await owner.writeJSON(authPublicKey)
  }

  override async stop(ctx: PluginContext): Promise<void> {
    if (this.syncTimer != null) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
    await super.stop(ctx)
  }
}
