import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { markRaw } from 'vue'
import { manifest } from './manifest'
import { SettingsExtension } from './settings-extension'
import SettingsFooter from './ui/SettingsFooter.vue'
import SettingsLayout from './ui/SettingsLayout.vue'

export class SettingsPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(SettingsExtension)
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const shell = ctx.extensions.get(ShellExtension)
    shell.sidebar.register({
      id: 'arxhub.settings',
      icon: 'lu:settings',
      title: 'Settings',
      layout: SettingsLayout,
      region: 'bottom',
      order: 100,
    })
    // Staged settings edits are app-wide, so the status bar reports them even when Settings is closed.
    shell.footer.register({ id: 'arxhub.settings.pending', component: markRaw(SettingsFooter), region: 'right' })
  }
}
