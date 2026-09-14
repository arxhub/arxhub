import { Plugin, type PluginArgs, type PluginContext, type PluginHost } from '@arxhub/core'
import {
  bindPluginVfs,
  ObservedFileSystem,
  RootVfs,
  removeInfoSidecars,
  ScopedFileSystem,
  VaultVfs,
  VaultWatcher,
  VfsWatcher,
  type VirtualFileSystem,
} from '@arxhub/vfs'
import { manifest } from './manifest'

type VfsPluginArgs = PluginArgs & {
  // The instance-specific filesystem backend (HttpFileSystem / TauriFileSystem / NodeFileSystem).
  fs: VirtualFileSystem
}

export class VfsPlugin extends Plugin {
  private readonly fs: VirtualFileSystem

  constructor({ fs, ...args }: VfsPluginArgs) {
    super(args, manifest)
    this.fs = fs
  }

  // Wires the three VFS kinds: RootVfs (whole tree) and VaultVfs (vault/ user content) as shared
  // services, plus a per-plugin PluginVfs (storage/state/temp) bound into every plugin's scope.
  override setup(host: PluginHost): void {
    const watcher = new VfsWatcher({
      onError: (error, change) => this.logger.error({ err: error, change }, 'A vault change listener failed'),
    })

    host.services.bind(RootVfs, () => this.fs)
    host.services.bind(VaultWatcher, () => watcher)
    // Only the vault view is observed, and observing it here covers every writer: an editor, the
    // explorer and sync all reach content through this one view, so none of them has to know that
    // anything (the search index) is keeping up with them.
    host.services.bind(VaultVfs, () => ObservedFileSystem.wrap(new ScopedFileSystem(this.fs, 'vault'), watcher))
    // RootVfs and the per-plugin buckets stay unwrapped: only content is indexed, and a repo store or a
    // cache file has no subscriber waiting for it.
    host.configureScope(bindPluginVfs)
  }

  // Detached, like every bring-up that could hold the first paint: the sweep walks the whole root once
  // per store (marker-guarded), which over HTTP is a request per directory.
  override start(ctx: PluginContext): Promise<void> {
    void removeInfoSidecars(this.fs)
      .then((removed) => {
        if (removed > 0) this.logger.info(`Removed ${removed} legacy .arxmeta sidecars`)
      })
      .catch((error) => this.logger.error('Could not sweep legacy .arxmeta sidecars', error))
    return super.start(ctx)
  }
}
