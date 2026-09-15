import { Plugin, type PluginArgs, type PluginContext, type PluginHost } from '@arxhub/core'
import {
  bindPluginVfs,
  ObservedFileSystem,
  RootVfs,
  removeInfoSidecars,
  ScopedFileSystem,
  VaultVfs,
  VaultWatcher,
  type VfsChange,
  VfsWatcher,
  type VirtualFileSystem,
  watchTree,
} from '@arxhub/vfs'
import { manifest } from './manifest'

type VfsPluginArgs = PluginArgs & {
  // The instance-specific filesystem backend (HttpFileSystem / TauriFileSystem / NodeFileSystem).
  fs: VirtualFileSystem
}

export class VfsPlugin extends Plugin {
  private readonly fs: VirtualFileSystem
  private watcher!: VfsWatcher
  private stopping = false
  // The native watch's own unsubscribe, once the detached start-up has one — null while it is still
  // opening, and stays null forever on a backend that has none to give (vfs-http).
  private nativeWatch: Promise<(() => void) | null> | null = null

  constructor({ fs, ...args }: VfsPluginArgs) {
    super(args, manifest)
    this.fs = fs
  }

  // Wires the three VFS kinds: RootVfs (whole tree) and VaultVfs (vault/ user content) as shared
  // services, plus a per-plugin PluginVfs (storage/state/temp) bound into every plugin's scope.
  override setup(host: PluginHost): void {
    this.watcher = new VfsWatcher({
      onError: (error, change) => this.logger.error({ err: error, change }, 'A vault change listener failed'),
    })

    host.services.bind(RootVfs, () => this.fs)
    host.services.bind(VaultWatcher, () => this.watcher)
    // Only the vault view is observed, and observing it here covers every writer: an editor, the
    // explorer and sync all reach content through this one view, so none of them has to know that
    // anything (the search index) is keeping up with them.
    host.services.bind(VaultVfs, () => ObservedFileSystem.wrap(new ScopedFileSystem(this.fs, 'vault'), this.watcher))
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

    this.stopping = false
    // Detached too, and for the same reason: opening a native watch reaches into the OS. It feeds the
    // SAME VfsWatcher the vault view's own writes already go through, so an edit made outside the app
    // (the SketchUp case) reaches the repository's journal and the search queue with no code of theirs —
    // and an edit made THROUGH the app now arrives twice, once from ObservedFileSystem and once from the
    // OS. Both subscribers coalesce by path already (`index-queue.ts`, `repo.add`), so the duplicate is
    // harmless.
    this.nativeWatch = watchTree(this.fs, 'vault', (change: VfsChange) => this.watcher.notify(change))
      .then((unwatch) => {
        if (this.stopping) {
          unwatch?.()
          return null
        }
        if (unwatch == null) this.logger.warn('This backend has no native watch — an external edit surfaces only at the next sync')
        else this.logger.info('Watching the vault natively for changes made outside the app')
        return unwatch
      })
      .catch((error) => {
        this.logger.error('Could not start a native watch on the vault', error)
        return null
      })

    return super.start(ctx)
  }

  override async stop(ctx: PluginContext): Promise<void> {
    this.stopping = true
    const unwatch = await this.nativeWatch?.catch(() => null)
    unwatch?.()
    this.nativeWatch = null
    await super.stop(ctx)
  }
}
