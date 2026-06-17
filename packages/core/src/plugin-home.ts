import { ScopedFileSystem, type VirtualFileSystem } from '@arxhub/vfs'
import type { PluginManifest } from './plugin'

// Holder token for the instance-provided root VirtualFileSystem. Bound in the root `services`
// container by each instance; a plugin resolves it by falling through to that parent. A plugin that
// needs broader-than-home access (e.g. sync chunking the whole synced tree) resolves RootVfs directly
// — this is an organizational layout, not an isolation boundary against in-process code.
export class RootVfs {
  constructor(readonly fs: VirtualFileSystem) {}
}

// A plugin's home — three buckets, each prefix-scoped to `<bucket>/<plugin-id>/`:
//   storage/  synced, durable     — config + data
//   state/    local,  durable     — repo store, device-local prefs (never synced)
//   temp/     local,  disposable  — cache, safe to wipe
export class PluginHome {
  readonly storage: VirtualFileSystem
  readonly state: VirtualFileSystem
  readonly temp: VirtualFileSystem

  constructor(root: VirtualFileSystem, manifest: PluginManifest) {
    const id = manifest.name
    this.storage = new ScopedFileSystem(root, `storage/${id}`)
    this.state = new ScopedFileSystem(root, `state/${id}`)
    this.temp = new ScopedFileSystem(root, `temp/${id}`)
  }
}
