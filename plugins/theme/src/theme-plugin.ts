import { PluginConfig } from '@arxhub/config'
import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
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

  override async start(ctx: PluginContext): Promise<void> {
    await super.start(ctx)

    const themes = ctx.extensions.get(ThemeExtension)
    // tryRead: an unreachable settings store must not abort the boot, it just means the default theme.
    const cfg = await ctx.services.get(PluginConfig).tryRead(ThemeConfigSchema)
    themes.apply(cfg?.theme ?? 'default')
  }
}
