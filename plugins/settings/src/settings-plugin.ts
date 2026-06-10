import type { ArxHub } from '@arxhub/core'
import { Plugin, type PluginArgs } from '@arxhub/core'
import { createPanelStore } from '@arxhub/plugin-panels/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { manifest } from './manifest'
import { SettingsExtension } from './settings-extension'
import SettingsLayout from './ui/SettingsLayout.vue'
import SettingsPageHost from './ui/SettingsPageHost.vue'

export class SettingsPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(arxhub: ArxHub): void {
    super.create(arxhub)
    arxhub.extensions.register(SettingsExtension)
  }

  override configure(arxhub: ArxHub): void {
    super.configure(arxhub)

    const settings = arxhub.extensions.get(SettingsExtension)
    settings.store = createPanelStore(arxhub.events)
    settings.store.registerPanel({ id: 'settings.page', title: 'Settings', component: SettingsPageHost })

    const shell = arxhub.extensions.get(ShellExtension)
    shell.sidebar.register({
      id: 'arxhub.settings',
      icon: 'lu:settings',
      title: 'Settings',
      layout: SettingsLayout,
      region: 'bottom',
      order: 100,
    })
  }
}
