import { PluginConfig } from '@arxhub/config'
import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { Repo, SyncEngine } from '@arxhub/sync'
import { PluginVfs, RootVfs } from '@arxhub/vfs'
import { HttpFileSystem } from '@arxhub/vfs-http'
import { Type } from '@sinclair/typebox'
import { markRaw } from 'vue'
import { manifest } from './manifest'
import { SyncExtension } from './sync-extension'
import SyncFooter from './ui/SyncFooter.vue'

export const SyncConfigSchema = Type.Object({
  serverUrl: Type.String({ title: 'Server URL', default: '' }),
})

export class SyncPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override create(ctx: PluginContext): void {
    super.create(ctx)
    ctx.extensions.register(SyncExtension, () => ({}))
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)

    const config = ctx.services.get(PluginConfig)
    const settings = ctx.extensions.get(SettingsExtension)
    settings.register({ id: 'sync', title: 'Sync', schema: SyncConfigSchema, order: 10, config })

    const shell = ctx.extensions.get(ShellExtension)
    shell.footer.register({ id: 'arxhub.sync', component: markRaw(SyncFooter), region: 'right' })
  }

  override async start(ctx: PluginContext): Promise<void> {
    await super.start(ctx)

    const pluginVfs = ctx.services.get(PluginVfs)
    const cfg = await ctx.services.get(PluginConfig).read(SyncConfigSchema)

    if (cfg.serverUrl) {
      const remoteVfs = new HttpFileSystem({ baseUrl: cfg.serverUrl }, this.logger)
      const syncExt = ctx.extensions.get(SyncExtension)
      // Chunk the whole local tree (vault/ + storage/ content) via the root VFS, but keep the repo
      // store in state/ so sync never chunks its own internals (state/ is never synced and is never
      // add()-ed for snapshotting). state/temp exclusion is structural, not a permission check.
      syncExt.engine = new SyncEngine({
        local: new Repo(ctx.services.get(RootVfs), pluginVfs.state),
        remote: new Repo(remoteVfs),
      })
    }
  }
}
