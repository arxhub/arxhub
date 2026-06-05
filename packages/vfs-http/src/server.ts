import { type ArxHub, definePluginManifest, Plugin, type PluginArgs } from '@arxhub/core'
import { hasErrorCode } from '@arxhub/errors'
import { GatewayServerExtension } from '@arxhub/plugin-gateway/server'
import type { VirtualFileSystem } from '@arxhub/vfs'
import Elysia, { type AnyElysia, t } from 'elysia'
import { type ExistsResponse, type FileHeadResponse, type ListResponse, VFS_ROUTES } from './protocol'

// Server counterpart of HttpFileSystem: serves any VirtualFileSystem over HTTP
// using the wire contract in ./protocol. Mounted under the `/vfs` prefix to
// match HttpFileSystem's default base URL.
export function vfsRoutes(vfs: VirtualFileSystem): AnyElysia {
  return new Elysia({ prefix: '/vfs' })
    .get(VFS_ROUTES.list, async ({ query }): Promise<ListResponse> => {
      const entries = await vfs.list(String(query.prefix ?? ''))
      return { entries: entries.map((entry) => ({ pathname: entry.pathname, kind: entry.kind })) }
    })
    .get(VFS_ROUTES.read, async ({ query, set }) => {
      try {
        const bytes = await vfs.read(String(query.path ?? ''))
        return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'application/octet-stream' } })
      } catch {
        set.status = 404
        return 'Not Found'
      }
    })
    .put(
      VFS_ROUTES.write,
      async ({ query, body, set }) => {
        await vfs.write(String(query.path ?? ''), new Uint8Array(body))
        set.status = 204
        return ''
      },
      { body: t.ArrayBuffer() },
    )
    .delete(VFS_ROUTES.delete, async ({ query, set }) => {
      try {
        await vfs.delete(String(query.path ?? ''), { force: query.force === '1', recursive: query.recursive === '1' })
        set.status = 204
        return ''
      } catch (e) {
        if (hasErrorCode(e, 'FileNotFound')) {
          set.status = 404
          return 'Not Found'
        }
        throw e
      }
    })
    .get(VFS_ROUTES.exists, async ({ query }): Promise<ExistsResponse> => {
      return { exists: await vfs.exists(String(query.path ?? '')) }
    })
    .get(VFS_ROUTES.head, async ({ query, set }) => {
      try {
        return (await vfs.head(String(query.path ?? ''))) satisfies FileHeadResponse
      } catch {
        set.status = 404
        return 'Not Found'
      }
    })
}

const manifest = definePluginManifest({
  name: 'VfsHttpServer',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Serves a VirtualFileSystem over HTTP for browser-mode clients',
})

type VfsHttpServerPluginArgs = PluginArgs & {
  vfs: VirtualFileSystem
}

// Mounts vfsRoutes onto the gateway during configure(). Register alongside
// GatewayServerPlugin in a server instance, injecting the backing filesystem.
export class VfsHttpServerPlugin extends Plugin<ArxHub> {
  private readonly vfs: VirtualFileSystem

  constructor(args: VfsHttpServerPluginArgs) {
    super(args, manifest)
    this.vfs = args.vfs
  }

  override configure(target: ArxHub): void {
    super.configure(target)
    const { gateway } = target.extensions.get(GatewayServerExtension)
    gateway.use(vfsRoutes(this.vfs))
  }
}
