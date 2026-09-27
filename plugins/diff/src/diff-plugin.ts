import { PluginConfig } from '@arxhub/config'
import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { HotkeysExtension } from '@arxhub/plugin-hotkeys'
import { SettingsExtension } from '@arxhub/plugin-settings'
import { DIFF_LAYER, DIFF_NEXT_CHANGE, DIFF_PREVIOUS_CHANGE } from './contributions'
import { DiffConfigSchema, toDiffSettings } from './diff-config'
import { DiffExtension } from './diff-extension'
import { messages, t } from './i18n/messages'
import { manifest } from './manifest'
import { textDiff } from './text-differ'

export class DiffPlugin extends Plugin {
  private unwatchConfig: (() => void) | null = null
  private disposers: (() => void)[] = []
  private bringUp: Promise<void> | null = null
  private stopping = false
  // Cleared by config.watch: a section save landing while the boot read is still in flight wins over it.
  private bootConfigPending = true

  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(DiffExtension)
    // Registered here rather than in configure(): a format owner registers in its own configure(), and the
    // fallback must already exist by then whatever order the plugins were listed in.
    this.disposers.push(
      ctx.extensions.get(DiffExtension).registerDiffer({
        id: 'text',
        fallback: true,
        matches: () => true,
        diff: (left, right) => (left.text != null && right.text != null ? textDiff(left.text, right.text) : null),
      }),
    )
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    const diff = ctx.extensions.get(DiffExtension)
    const config = ctx.services.get(PluginConfig)

    ctx.extensions.get(SettingsExtension).register({
      id: 'diff',
      title: () => t('settings.title'),
      description: () => t('settings.description'),
      icon: 'lu:git-compare',
      order: 14,
      schema: DiffConfigSchema,
      config,
      messages,
    })
    this.unwatchConfig = config.watch(DiffConfigSchema, (cfg) => {
      this.bootConfigPending = false
      diff.settings.value = toDiffSettings(cfg)
    })

    // The layer is on the stack only while focus is inside a mounted diff, so `run` never has to ask where the
    // keyboard is — only which of the attached views holds it.
    const hotkeys = ctx.extensions.get(HotkeysExtension)
    this.disposers.push(
      hotkeys.register({
        id: DIFF_NEXT_CHANGE,
        chord: 'Alt-ArrowDown',
        layer: DIFF_LAYER,
        title: () => t('hotkeys.next'),
        run: () => diff.focusedView()?.step(1),
      }),
      hotkeys.register({
        id: DIFF_PREVIOUS_CHANGE,
        chord: 'Alt-ArrowUp',
        layer: DIFF_LAYER,
        title: () => t('hotkeys.previous'),
        run: () => diff.focusedView()?.step(-1),
      }),
    )
  }

  // Synchronous up to assigning the bring-up: an await before it would let a stop() in the same tick find
  // nothing to wait for. The read goes over HTTP on the browser client, so it must not hold the first paint;
  // the defaults stand until it lands.
  override start(ctx: PluginContext): Promise<void> {
    this.stopping = false
    this.bootConfigPending = true
    this.bringUp = this.loadConfig(ctx)
    void this.bringUp.catch((error) => this.logger.error('Could not read Diff settings — using defaults', error))
    return super.start(ctx)
  }

  private async loadConfig(ctx: PluginContext): Promise<void> {
    const cfg = await ctx.services.get(PluginConfig).tryRead(DiffConfigSchema)
    if (this.stopping || !this.bootConfigPending) return
    ctx.extensions.get(DiffExtension).settings.value = toDiffSettings(cfg ?? {})
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.stopping = true
    await this.bringUp?.catch(() => {})
    this.unwatchConfig?.()
    this.unwatchConfig = null
    for (const dispose of this.disposers.splice(0)) dispose()
    await super.stop(ctx)
  }
}
