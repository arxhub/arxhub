import type { Plugin, ServiceScope } from '@arxhub/core'
import { createKey } from '@arxhub/di'
import { ScopedFileSystem } from './scoped-file-system'
import type { VirtualFileSystem } from './virtual-file-system'

// Root VFS — the real filesystem root (the whole tree). DI key resolving directly to the backend the
// instance bound via VfsPlugin. Privileged: sync chunks the whole tree, and VfsPlugin derives the
// vault + per-plugin scopes from it. Not for general plugin use.
export const RootVfs = createKey<VirtualFileSystem>('RootVfs')

// Vault VFS — the user's content (everything under vault/). DI key, one shared instance. This is what
// content plugins (explorer, editors) read and write.
export const VaultVfs = createKey<VirtualFileSystem>('VaultVfs')

// Plugin VFS — a single plugin's OWN files, each bucket prefix-scoped to `<bucket>/<id>/`. Neither the
// whole tree (that's RootVfs) nor user content (that's VaultVfs):
//   storage/  synced, durable     — config + data
//   state/    local,  durable     — repo store, device-local prefs (never synced)
//   temp/     local,  disposable  — cache, safe to wipe
export class PluginVfs {
  readonly storage: VirtualFileSystem
  readonly state: VirtualFileSystem
  readonly temp: VirtualFileSystem

  constructor(root: VirtualFileSystem, id: string) {
    this.storage = new ScopedFileSystem(root, `storage/${id}`)
    this.state = new ScopedFileSystem(root, `state/${id}`)
    this.temp = new ScopedFileSystem(root, `temp/${id}`)
  }
}

// ScopeConfigurer for PluginHost.configureScope (called from a plugin's setup): binds a per-plugin
// `PluginVfs` into each plugin's DI scope, derived from the instance-bound RootVfs + the plugin id.
// Lazy — RootVfs is only resolved when a plugin actually reads its PluginVfs, so RootVfs-less
// instances (e.g. the headless server) are unaffected.
export function bindPluginVfs(scope: ServiceScope, plugin: Plugin): void {
  scope.register(PluginVfs, () => [scope.get(RootVfs), plugin.manifest.name])
}
