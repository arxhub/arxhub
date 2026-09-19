import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { ShellExtension } from '@arxhub/plugin-shell'
import { markRaw } from 'vue'
import { SETTINGS_TYPE_ID } from './contributions'
import { manifest } from './manifest'
import { SettingsExtension } from './settings-extension'
import PendingChangesStatus from './ui/PendingChangesStatus.vue'
import SettingsLayout from './ui/SettingsLayout.vue'
import SettingsNav from './ui/SettingsNav.vue'

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
    // which is what a tab means (F-23). Unpinned (OR-05): a permanent key in the phone's bottom row is
    // the most reachable place the frame has, and settings are not where the owner works — it is
    // reached from the "Open or switch to" sheet and stands in the row only while it is open. The same
    // in both frames, because `pinned` describes the type and not a frame, and a per-frame pin would
    // make every plugin answer that question twice.
    shell.types.register({
      id: SETTINGS_TYPE_ID,
      icon: 'lu:settings',
      title: 'Settings',
      order: 1000,
      pinned: false,
      content: markRaw(SettingsLayout),
      nav: { component: markRaw(SettingsNav), title: 'Sections' },
    })
    // Staged settings edits are app-wide, so the status bar reports them even when Settings is closed.
    // It reports and leads back; applying them is SettingsChangesBar's job, so this is a state.
    shell.status.register({ id: 'arxhub.settings.pending', kind: 'status', component: markRaw(PendingChangesStatus) })
  }
}
