import { PluginConfig } from '@arxhub/config'
import { Plugin, type PluginArgs, type PluginHost } from '@arxhub/core'
import { Logger } from '@arxhub/logger'
import { PluginVfs } from '@arxhub/vfs'
import { manifest } from './manifest'

// Provides config via DI, mirroring VfsPlugin: binds a per-plugin PluginConfig (TOML config scoped to
// the plugin's own buckets — the synced storage one and the device-local state one) into every
// plugin's scope. A plugin then reads its config with
// `ctx.services.get(PluginConfig)` instead of calling the free readConfig/writeConfig with a storage
// VFS. Requires VfsPlugin (PluginConfig derives from PluginVfs.storage + .state) and LoggerPlugin (the scoped
// Logger attributes config-parse warnings to the owning plugin).
export class ConfigPlugin extends Plugin {
  constructor(args: PluginArgs) {
    super(args, manifest)
  }

  override setup(host: PluginHost): void {
    host.configureScope((scope) => {
      scope.register(PluginConfig, () => {
        const vfs = scope.get(PluginVfs)
        // Both halves of the plugin's own config: the synced file and the device-local one. Which
        // keys land in which is the schema's `deviceLocal` annotation, read inside PluginConfig.
        return [vfs.storage, scope.get(Logger), vfs.state]
      })
    })
  }
}
