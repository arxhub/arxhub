import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { SettingsExtension } from '@arxhub/plugin-settings'
import { ShellExtension } from '@arxhub/plugin-shell'
import { markRaw } from 'vue'
import type { BootPolicy } from './boot-policy'
import { MaintenanceExtension } from './maintenance-extension'
import { manifest } from './manifest'
import MaintenanceStatus from './ui/MaintenanceStatus.vue'
import PluginsSettingsPage from './ui/PluginsSettingsPage.vue'

export interface MaintenancePluginArgs extends PluginArgs {
  // The same policy the composition root read before start() — see BootPolicy.
  policy: BootPolicy
}

// The in-app half of the recovery story: the Plugins settings page, plus a footer marker while the app
// is running a maintenance boot. The other half (the crash screen) runs before any of this exists.
export class MaintenancePlugin extends Plugin {
  private readonly policy: BootPolicy

  constructor(args: MaintenancePluginArgs) {
    super(args, manifest)
    this.policy = args.policy
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(MaintenanceExtension, () => ({ policy: this.policy }))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    ctx.extensions.get(SettingsExtension).register({
      id: 'plugins',
      title: 'Plugins',
      icon: 'lu:puzzle',
      order: 850,
      component: markRaw(PluginsSettingsPage),
    })

    // Only while it applies: a maintenance boot looks like a broken app (no explorer, no editor), and
    // this is what tells the owner it is deliberate and where to undo it. A state of the whole boot,
    // which is why it is a status and not an action — the undoing happens on the Plugins page.
    if (this.policy.maintenance) {
      ctx.extensions.get(ShellExtension).status.register({ id: 'arxhub.maintenance', kind: 'status', component: markRaw(MaintenanceStatus) })
    }
  }
}
