import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { GatewayServerExtension } from '@arxhub/plugin-gateway'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { vfsRoutes } from '@arxhub/vfs-http/server'
import { serverManifest } from '../manifest'

type VfsHttpServerPluginArgs = PluginArgs & {
  vfs: VirtualFileSystem
}

// Mounts vfsRoutes onto the gateway during configure(). Register alongside GatewayServerPlugin in a
// server instance, injecting the backing filesystem.
export class VfsHttpServerPlugin extends Plugin {
  private readonly vfs: VirtualFileSystem

  constructor(args: VfsHttpServerPluginArgs) {
    super(args, serverManifest)
    this.vfs = args.vfs
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    ctx.extensions.get(GatewayServerExtension).forPlugin(this).use(vfsRoutes(this.vfs))
  }
}
