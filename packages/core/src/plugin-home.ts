import { forbidden } from '@arxhub/errors'
import { type Scope, ScopedFileSystem, type VirtualFileSystem } from '@arxhub/vfs'
import type { PluginManifest } from './plugin'

// Holder token for the instance-provided root VirtualFileSystem. Bound in the root `services`
// container by each instance; a plugin's scope resolves it by falling through to that parent.
export class RootVfs {
  constructor(readonly fs: VirtualFileSystem) {}
}

// A plugin's sandboxed home — three buckets, each scoped to `<bucket>/<plugin-id>/`, plus access to
// any extra scopes the manifest's permissions granted (`granted(id)`):
//   storage/  synced, durable     — config + data
//   state/    local,  durable     — repo store, device-local prefs (never synced)
//   temp/     local,  disposable  — cache, safe to wipe
export class PluginHome {
  readonly storage: VirtualFileSystem
  readonly state: VirtualFileSystem
  readonly temp: VirtualFileSystem
  private readonly root: VirtualFileSystem
  private readonly scopes = new Map<string, Scope>()

  constructor(root: VirtualFileSystem, manifest: PluginManifest) {
    this.root = root
    const id = manifest.name
    this.storage = new ScopedFileSystem(root, `storage/${id}`)
    this.state = new ScopedFileSystem(root, `state/${id}`)
    this.temp = new ScopedFileSystem(root, `temp/${id}`)

    // Accumulate declared scope permissions by identifier (merging allow/deny across duplicates).
    for (const perm of manifest.permissions ?? []) {
      if (typeof perm === 'string') continue
      const acc = this.scopes.get(perm.identifier) ?? { allow: [], deny: [] }
      acc.allow = [...(acc.allow ?? []), ...(perm.allow ?? [])]
      acc.deny = [...(acc.deny ?? []), ...(perm.deny ?? [])]
      this.scopes.set(perm.identifier, acc)
    }
  }

  // A scope-enforcing view over the whole root for a permission the manifest declared (e.g.
  // 'vfs:scope'). Throws if that scope was not granted to this plugin.
  granted(scopeId: string): VirtualFileSystem {
    const scope = this.scopes.get(scopeId)
    if (scope == null) throw forbidden(`Scope '${scopeId}' was not granted to this plugin`)
    return new ScopedFileSystem(this.root, '', scope)
  }
}
