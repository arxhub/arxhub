import { Plugin, type PluginArgs } from '@arxhub/core'
import type { ArxHub } from '@arxhub/core'
import { readConfig } from '@arxhub/config'
import { Type } from '@sinclair/typebox'
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { VfsExtension } from '@arxhub/plugin-vfs/ui'
import { Repo, SyncEngine } from '@arxhub/sync'
import { HttpFileSystem } from '@arxhub/vfs-http'
import { manifest } from './manifest'
import { SyncExtension } from './sync-extension'
import SyncFooter from './ui/SyncFooter.vue'
import SyncSettings from './ui/SyncSettings.vue'

export const SyncConfigSchema = Type.Object({
  serverUrl: Type.String({ title: 'Server URL', default: '' }),
})

export class SyncPlugin extends Plugin<ArxHub> {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(arxhub: ArxHub): void {
    super.create(arxhub)
    arxhub.extensions.register(SyncExtension, () => ({}))
  }

  override configure(arxhub: ArxHub): void {
    super.configure(arxhub)

    const { store } = arxhub.extensions.get(PanelStoreExtension)
    store.registerPanel({
      id: 'arxhub.sync.settings',
      title: 'Sync Settings',
      component: SyncSettings,
    })

    const shell = arxhub.extensions.get(ShellExtension)
    shell.footer.register({ id: 'arxhub.sync', component: SyncFooter, region: 'right' })
  }

  override async start(arxhub: ArxHub): Promise<void> {
    await super.start(arxhub)

    const { vfs } = arxhub.extensions.get(VfsExtension)
    const cfg = await readConfig(vfs, this.manifest.name, SyncConfigSchema)

    if (cfg.serverUrl) {
      const remoteVfs = new HttpFileSystem({ baseUrl: cfg.serverUrl }, this.logger)
      const syncExt = arxhub.extensions.get(SyncExtension)
      syncExt.engine = new SyncEngine({
        local: new Repo(vfs),
        remote: new Repo(remoteVfs),
      })
    }
  }
}
