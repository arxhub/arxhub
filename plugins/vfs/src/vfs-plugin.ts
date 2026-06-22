import { Plugin, type PluginArgs, type PluginHost } from '@arxhub/core'
import { bindPluginVfs, RootVfs, ScopedFileSystem, VaultVfs, type VirtualFileSystem } from '@arxhub/vfs'
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
    host.services.bind(RootVfs, () => this.fs)
    host.services.bind(VaultVfs, () => new ScopedFileSystem(this.fs, 'vault'))
    host.configureScope(bindPluginVfs)
  }
}
