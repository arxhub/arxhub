import { definePluginManifest, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { GatewayServerExtension } from '@arxhub/plugin-gateway/server'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { VFS_NAMESPACE } from '@arxhub/vfs-http'
import { vfsRoutes } from '@arxhub/vfs-http/server'

const manifest = definePluginManifest({
  name: 'VfsHttpServer',
  namespace: VFS_NAMESPACE,
  version: '0.1.0',
  author: 'arxhub',
  description: 'Serves a VirtualFileSystem over HTTP for browser-mode clients',
})

type VfsHttpServerPluginArgs = PluginArgs & {
  vfs: VirtualFileSystem
}

// Mounts vfsRoutes onto the gateway during configure(). Register alongside GatewayServerPlugin in a
// server instance, injecting the backing filesystem.
export class VfsHttpServerPlugin extends Plugin {
  private readonly vfs: VirtualFileSystem

  constructor(args: VfsHttpServerPluginArgs) {
    super(args, manifest)
    this.vfs = args.vfs
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    ctx.extensions.get(GatewayServerExtension).forPlugin(this).use(vfsRoutes(this.vfs))
  }
}
