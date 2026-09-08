import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { markRaw } from 'vue'
import { SETTINGS_TYPE_ID } from './contributions'
import { manifest } from './manifest'
import { SettingsExtension } from './settings-extension'
import PendingChangesStatus from './ui/PendingChangesStatus.vue'
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
    // A type with no objects: a section is chosen from a list, not opened, closed, split and dragged —
    // which is what a tab means (F-23). Ordered last on purpose: it is a utility, and it sits after the
    // places the owner works in, in the row exactly as it did at the foot of the old rail.
    shell.types.register({
      id: SETTINGS_TYPE_ID,
      icon: 'lu:settings',
      title: 'Settings',
      order: 1000,
      content: markRaw(SettingsLayout),
    })
    // Staged settings edits are app-wide, so the status bar reports them even when Settings is closed.
    // It reports and leads back; applying them is SettingsChangesBar's job, so this is a state.
    shell.status.register({ id: 'arxhub.settings.pending', kind: 'status', component: markRaw(PendingChangesStatus) })
  }
}
