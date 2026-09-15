import { PluginConfig } from '@arxhub/config'
import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { join } from '@arxhub/path'
import { NotesExtension } from '@arxhub/plugin-notes/ui'
import { KeyringExtension } from '@arxhub/plugin-protection/ui'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { Repo } from '@arxhub/sync'
import { PluginVfs, RootVfs, VaultWatcher } from '@arxhub/vfs'
import { Type } from '@sinclair/typebox'
import { manifest } from './manifest'
import { RepositoryExtension } from './repository-extension'

export const RepositoryConfigSchema = Type.Object({
  // Device-local (A-20): a phone with little storage keeps a small slice of the vault on disk while a
  // desktop keeps everything, and the two must not agree by sync. A file already on disk stays
  // current regardless (Repo.wantsContent) — this only decides what a NEW remote file costs to bring
  // down, so it is legitimately meaningless without a remote and stays here anyway: the policy is the
  // repository's to enforce, whichever plugin (if any) ends up fetching content for it.
  materializeUpTo: Type.Number({
    title: 'Keep files up to (MB) on this device',
    description: '0 keeps everything on this device; larger files stay on the server until opened',
    default: 0,
    minimum: 0,
    deviceLocal: true,
    unit: 'MB',
  }),
})

export class RepositoryPlugin extends Plugin {
  private repo!: Repo
  private bringUp: Promise<void> | null = null
  private stopping = false
  private unwatch: (() => void) | null = null

  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    const rootVfs = ctx.services.get(RootVfs)
    // The repo store lives in state/ (local, durable, never synced) — kept separate from the tree it
    // versions so it can hold its own internals without chunking itself.
    this.repo = new Repo(rootVfs, ctx.services.get(PluginVfs).state)
    ctx.extensions.register(RepositoryExtension, () => ({
      repo: this.repo,
      rootVfs,
      keyring: ctx.extensions.get(KeyringExtension),
    }))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const config = ctx.services.get(PluginConfig)
    const settings = ctx.extensions.get(SettingsExtension)
    settings.register({ id: 'repository', title: 'Storage', schema: RepositoryConfigSchema, order: 9, config })

    const repository = ctx.extensions.get(RepositoryExtension)

    // Every vault write reaches the journal as it happens, in the repo's coordinates (the watcher
    // speaks vault-relative paths; the repo trees the root). A rename names both ends: the old path
    // has to be seen as gone, the new one as arrived. Listener errors are the watcher's to report,
    // never the writer's to see — and the journal write is fire-and-forget for the same reason.
    this.unwatch = ctx.services.get(VaultWatcher).subscribe((change) => {
      const paths = change.from == null ? [change.pathname] : [change.from, change.pathname]
      for (const path of paths)
        void this.repo.add(join('vault', path)).catch((error) => this.logger.error('Could not journal a vault change', error))
    })

    // A file left in the cloud comes down before whatever opens it mounts; a file that is on disk
    // costs one index lookup here and nothing else. Notes is essential too, like this plugin — no
    // has() guard needed: a boot with one of the two switched off is a state nobody has designed.
    ctx.extensions.get(NotesExtension).registerPreparer((path) => repository.materializeIfPending(path))
  }

  override start(ctx: PluginContext): Promise<void> {
    this.stopping = false
    this.bringUp = this.bringUpRepository(ctx)
    void this.bringUp.catch((error) => this.logger.error('Could not prepare the local repository', error))
    return super.start(ctx)
  }

  private async bringUpRepository(ctx: PluginContext): Promise<void> {
    const repository = ctx.extensions.get(RepositoryExtension)
    await repository.ready()
    if (this.stopping) return

    // tryRead, not read: the product works offline (FR-147), so an unreachable settings store leaves
    // the default policy (keep everything) instead of aborting the whole boot.
    const cfg = await ctx.services.get(PluginConfig).tryRead(RepositoryConfigSchema)
    if (this.stopping || cfg == null) return

    // A file without a size is a manifest entry written before sizes existed (completeLegacyEntries
    // fills it in the next time this device writes a snapshot) — kept, never left in the cloud on a
    // guess about how big it might be.
    this.repo.setMaterializePolicy((file) => cfg.materializeUpTo === 0 || file.size == null || file.size <= cfg.materializeUpTo * 1024 * 1024)
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.stopping = true
    await this.bringUp?.catch(() => {})
    this.unwatch?.()
    this.unwatch = null
    await super.stop(ctx)
  }
}
