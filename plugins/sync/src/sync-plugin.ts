import { readConfig } from '@arxhub/config'
import type { ArxHub } from '@arxhub/core'
import { Plugin, type PluginArgs, PluginHome, RootVfs } from '@arxhub/core'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { Repo, SyncEngine } from '@arxhub/sync'
import { HttpFileSystem } from '@arxhub/vfs-http'
import { Type } from '@sinclair/typebox'
import { markRaw } from 'vue'
import { manifest } from './manifest'
import { SyncExtension } from './sync-extension'
import SyncFooter from './ui/SyncFooter.vue'

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

    const home = this.container.get(PluginHome)
    const settings = arxhub.extensions.get(SettingsExtension)
    settings.register({ id: 'sync', title: 'Sync', schema: SyncConfigSchema, order: 10, storage: home.storage })

    const shell = arxhub.extensions.get(ShellExtension)
    shell.footer.register({ id: 'arxhub.sync', component: markRaw(SyncFooter), region: 'right' })
  }

  override async start(arxhub: ArxHub): Promise<void> {
    await super.start(arxhub)

    const home = this.container.get(PluginHome)
    const cfg = await readConfig(home.storage, SyncConfigSchema, {}, this.logger)

    if (cfg.serverUrl) {
      const remoteVfs = new HttpFileSystem({ baseUrl: cfg.serverUrl }, this.logger)
      const syncExt = arxhub.extensions.get(SyncExtension)
      // Chunk the whole local tree (vault/ + storage/ content) via the root VFS, but keep the repo
      // store in home.state/ so sync never chunks its own internals (state/ is never synced and is
      // never add()-ed for snapshotting). state/temp exclusion is structural, not a permission check.
      const root = this.container.get(RootVfs).fs
      syncExt.engine = new SyncEngine({
        local: new Repo(root, home.state),
        remote: new Repo(remoteVfs),
      })
    }
  }
}
