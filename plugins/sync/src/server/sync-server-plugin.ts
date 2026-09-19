import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { GatewayServerExtension } from '@arxhub/plugin-gateway'
import { VfsSyncRemote } from '@arxhub/sync'
import { objectStoreRoutes } from '@arxhub/sync/server'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { serverManifest } from '../manifest'

type SyncServerPluginArgs = PluginArgs & {
  // Root for the sync object store (`/head`, `/objects/...`) — typically a ScopedFileSystem over the
  // instance root, e.g. `new ScopedFileSystem(vfs, 'repo')`. The server stores opaque
  // (client-encrypted) blobs here and never interprets them.
  vfs: VirtualFileSystem
}

// Mounts the sync object store at `/api/sync` during configure(). Register alongside GatewayServerPlugin
// in a server instance, injecting the backing object store (mirrors VfsHttpServerPlugin).
export class SyncServerPlugin extends Plugin {
  private readonly vfs: VirtualFileSystem

  constructor(args: SyncServerPluginArgs) {
    super(args, serverManifest)
    this.vfs = args.vfs
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    ctx.extensions
      .get(GatewayServerExtension)
      .forPlugin(this)
      .use(objectStoreRoutes(new VfsSyncRemote(this.vfs)))
  }
}
