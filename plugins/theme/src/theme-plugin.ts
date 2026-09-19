import { PluginConfig } from '@arxhub/config'
import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { SettingsExtension } from '@arxhub/plugin-settings'
import { Type } from '@sinclair/typebox'
import { h, markRaw } from 'vue'
import { manifest } from './manifest'
import type { Theme } from './theme-extension'
import { ThemeExtension } from './theme-extension'
import ThemeSettingsPage from './ui/ThemeSettingsPage.vue'

export const ThemeConfigSchema = Type.Object({
  theme: Type.String({ title: 'Theme', default: 'default' }),
})

export interface ThemePluginArgs extends PluginArgs {
  // The themes whose CSS this instance actually bundles. Registering one whose stylesheet is absent
  // would offer the user a theme that does nothing, so the instance declares what it shipped.
  themes: Theme[]
}

export class ThemePlugin extends Plugin {
  private readonly themes: Theme[]
  private bringUp: Promise<void> | null = null
  private stopping = false

  constructor(args: ThemePluginArgs) {
    super(args, manifest)
    this.themes = args.themes
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(ThemeExtension)
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const themes = ctx.extensions.get(ThemeExtension)
    themes.register(...this.themes)

    const config = ctx.services.get(PluginConfig)
    ctx.extensions.get(SettingsExtension).register({
      id: 'appearance',
      title: 'Appearance',
      order: 5,
      component: markRaw({
        render: () =>
          h(ThemeSettingsPage, {
            onSelect: (id: string) => {
              themes.apply(id)
              // Persist through the plugin's own config, so the choice travels with the vault.
              config.write(ThemeConfigSchema, { theme: id }).catch((error) => this.logger.error('Could not save the theme', error))
            },
          }),
      }),
    })
  }

  override start(ctx: PluginContext): Promise<void> {
    // Do not await tryRead: on the browser client PluginConfig is HTTP. Until the read lands the
    // page uses the stylesheet default (light when nothing is selected — theme-preset).
    const themes = ctx.extensions.get(ThemeExtension)
    this.stopping = false
    this.bringUp = this.loadTheme(ctx, themes)
    void this.bringUp.catch((error) => this.logger.error('Could not read theme settings — using default', error))
    return super.start(ctx)
  }

  private async loadTheme(ctx: PluginContext, themes: ThemeExtension): Promise<void> {
    // tryRead: an unreachable settings store must not abort the boot, it just means the default theme.
    const cfg = await ctx.services.get(PluginConfig).tryRead(ThemeConfigSchema)
    if (this.stopping) return
    const id = this.resolveBundledThemeId(themes, cfg?.theme ?? 'default')
    if (cfg?.theme != null && cfg.theme !== id) {
      this.logger.warn(`Saved theme "${cfg.theme}" is not bundled — using ${id}`)
    }
    // Immediate pick in Settings can land while tryRead is still in flight on vfs-http — do not replay saved id over it.
    if (themes.activeId.value == null) themes.apply(id)
  }

  /** Config may name a theme a later build dropped; never leave the root without a bundled theme. */
  private resolveBundledThemeId(themes: ThemeExtension, requested: string): string {
    if (themes.themes.value.some((t) => t.id === requested)) return requested
    const fallback = themes.themes.value.find((t) => t.id === 'default') ?? themes.themes.value[0]
    return fallback?.id ?? requested
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.stopping = true
    await this.bringUp?.catch(() => {})
    await super.stop(ctx)
  }
}
