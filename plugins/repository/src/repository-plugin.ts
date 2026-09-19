import { PluginConfig } from '@arxhub/config'
import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { join } from '@arxhub/path'
import { KeyringExtension } from '@arxhub/plugin-protection/ui'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { Repo } from '@arxhub/sync'
import { PluginVfs, RootVfs, VaultWatcher } from '@arxhub/vfs'
import { type Static, Type } from '@sinclair/typebox'
import { manifest } from './manifest'
import { RepositoryExtension } from './repository-extension'
import { DEFAULT_TEXT_EXTENSIONS, textMerger, toTextExtensions } from './text-merger'

export const RepositoryConfigSchema = Type.Object({
  // Device-local (A-20): a phone with little storage keeps a small slice of the vault on disk while a
  // desktop may keep everything, and the two must not agree by sync. A file already on disk stays
  // current regardless (Repo.wantsContent) — this only decides what a NEW remote file costs to bring
  // down, so it is legitimately meaningless without a remote and stays here anyway: the policy is the
  // repository's to enforce, whichever plugin (if any) ends up fetching content for it.
  //
  // 20 MB by default, not "everything" (A-45, owner 2026-09-15): a film or a raw export arriving from
  // another device is not downloaded until this one opens it; a note, a photo, a PDF always is.
  materializeUpTo: Type.Number({
    title: 'Keep files up to (MB) on this device',
    description: '0 keeps everything on this device; larger files stay on the server until opened',
    default: 20,
    minimum: 0,
    deviceLocal: true,
    unit: 'MB',
  }),
  // Synced, not device-local: which files are text is a fact about the vault, and two devices merging the
  // same note by two different rules would produce two different files. Optional for the reason
  // `index.exclude` in plugins/search is — an empty list is a legitimate value ("merge nothing as text"),
  // and a required field that is empty blocks the global save from the moment the section opens.
  'merge.textExtensions': Type.Optional(
    Type.Array(Type.String(), {
      title: 'Merge as text',
      description:
        'Files with these extensions are merged line by line when both devices edited them; what still disagrees is marked in the file. Anything else becomes a conflict copy beside the original.',
      default: [...DEFAULT_TEXT_EXTENSIONS],
    }),
  ),
})

export class RepositoryPlugin extends Plugin {
  private repo!: Repo
  private bringUp: Promise<void> | null = null
  private stopping = false
  // Cleared when config.watch delivers a save while boot tryRead is still in flight (TH-24-01).
  private bootConfigPending = true
  private unwatch: (() => void) | null = null
  private unwatchConfig: (() => void) | null = null
  private unregisterTextMerger: (() => void) | null = null
  // Read by the text merger on every match, so a settings save changes what the NEXT round merges without
  // touching the registration. The default stands until the config has actually been read.
  private textExtensions: ReadonlySet<string> = toTextExtensions(undefined)

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

    // The one merger this plugin contributes itself: a format-agnostic line merge for whatever the owner
    // says is text. Formats with structure of their own (.arx, .arxs) register theirs from their own plugin.
    this.unregisterTextMerger = repository.registerContentMerger(textMerger(() => this.textExtensions))
    this.unwatchConfig = config.watch(RepositoryConfigSchema, (cfg) => {
      this.bootConfigPending = false
      this.applyConfig(cfg)
    })

    // Every vault write reaches the journal as it happens, in the repo's coordinates (the watcher
    // speaks vault-relative paths; the repo trees the root). A rename names both ends: the old path
    // has to be seen as gone, the new one as arrived. Listener errors are the watcher's to report,
    // never the writer's to see — and the journal write is fire-and-forget for the same reason.
    this.unwatch = ctx.services.get(VaultWatcher).subscribe((change) => {
      const paths = change.from == null ? [change.pathname] : [change.from, change.pathname]
      for (const path of paths)
        void this.repo.add(join('vault', path)).catch((error) => this.logger.error('Could not journal a vault change', error))
    })
  }

  override start(ctx: PluginContext): Promise<void> {
    this.stopping = false
    this.bootConfigPending = true
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
    if (this.bootConfigPending) this.applyConfig(cfg)
  }

  private applyConfig(cfg: Static<typeof RepositoryConfigSchema>): void {
    this.textExtensions = toTextExtensions(cfg['merge.textExtensions'])
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
    this.unwatchConfig?.()
    this.unwatchConfig = null
    this.unregisterTextMerger?.()
    this.unregisterTextMerger = null
    await super.stop(ctx)
  }
}
