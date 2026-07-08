import { definePluginManifest, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { GatewayServerExtension } from '@arxhub/plugin-gateway/server'
import { VfsSyncRemote } from '@arxhub/sync'
import { objectStoreRoutes } from '@arxhub/sync/server'
import type { VirtualFileSystem } from '@arxhub/vfs'
import Elysia from 'elysia'
import { PUBLISH_NAMESPACE } from '../namespace'
import { publicReadRoutes } from './public-read-routes'

const manifest = definePluginManifest({
  name: 'PublishServer',
  namespace: PUBLISH_NAMESPACE,
  version: '0.1.0',
  author: 'arxhub',
  description: 'Serves published (plaintext, content-addressed) content and its owner-only upload routes',
})

type PublishServerPluginArgs = PluginArgs & {
  // Root for the public object store — typically a ScopedFileSystem over the instance root, e.g.
  // `new ScopedFileSystem(vfs, 'public')`. Holds plaintext chunks + the manifest; everything is
  // world-readable via /api/publish/public/*.
  vfs: VirtualFileSystem
}

// Mounts two surfaces over one public store under the `publish` namespace (arxhub → `/api/publish`):
//   - `/objects/*` + `/head` (owner-only, behind the global auth guard): the SAME batched object
//     protocol sync uses — but the client omits the encryption wrapper, so chunks/manifest land as
//     plaintext. Reuses @arxhub/sync's objectStoreRoutes over an unencrypted VfsSyncRemote.
//   - `/public/*` (anonymous GET, allowlisted in the guard via PUBLIC_READ_PATH): serves the raw
//     published source bytes + manifest; the client reassembles and renders.
// Register alongside GatewayServerPlugin, and add PUBLIC_READ_PATH to ProtectionServerPlugin's
// publicGetPrefixes so anonymous reads pass the guard.
export class PublishServerPlugin extends Plugin {
  private readonly vfs: VirtualFileSystem

  constructor(args: PublishServerPluginArgs) {
    super(args, manifest)
    this.vfs = args.vfs
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    const routes = new Elysia().use(objectStoreRoutes(new VfsSyncRemote(this.vfs))).use(publicReadRoutes(this.vfs))
    ctx.extensions.get(GatewayServerExtension).forPlugin(this).use(routes)
  }
}
