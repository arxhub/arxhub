import { type ArxHub, definePluginManifest, Plugin, type PluginArgs } from '@arxhub/core'
import { hasErrorCode, validation } from '@arxhub/errors'
import { GatewayServerExtension } from '@arxhub/plugin-gateway/server'
import type { VirtualFileSystem } from '@arxhub/vfs'
import Elysia, { type AnyElysia, t } from 'elysia'
import { type ExistsResponse, type FileHeadResponse, type ListResponse, VFS_ROUTES } from './protocol'

// Reject oversized writes. The body is already buffered by Elysia's t.ArrayBuffer() parser, so this
// is a disk-DoS guard rather than a true streaming limit; configure a transport-level body limit at
// the gateway for full protection. 100 MiB is generous for note-style content.
const MAX_WRITE_BYTES = 100 * 1024 * 1024

// Sanitize UNTRUSTED HTTP input at the edge. Traversal confinement is now owned by the backend (the
// root NodeFileSystem rejects any path escaping its storage root), so this is defense-in-depth there;
// its load-bearing jobs are the two things the backend deliberately does NOT cover:
//   - The empty-path case: `allowEmpty` gates the root prefix. list() legitimately accepts '' (the
//     whole tree), but read/write/delete/head must reject it — '' resolves to the data root itself,
//     which the backend treats as a valid contained path, so delete('', {recursive}) would rm -rf
//     the whole VFS. This guard is the only thing stopping that.
//   - Status codes: a malformed path becomes a 400 (ValidationError) here, not the backend's 403.
// We resolve '.'/'..' ourselves against a virtual root rather than node:path.normalize (win32 on
// Windows, which would emit backslashes that bypass a '../' check); backslashes are folded to '/'
// first so the check is platform-independent.
function safePath(raw: unknown, { allowEmpty }: { allowEmpty: boolean }): string {
  const input = String(raw ?? '').replace(/\\/g, '/')
  const segments: string[] = []
  for (const segment of input.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) throw validation('Path escapes the filesystem root')
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  const cleaned = segments.join('/')
  if (cleaned === '' && !allowEmpty) throw validation('Path is required')
  return cleaned
}

// Single error→HTTP-status mapping shared by every route: a rejected path → 400, a missing file →
// 404, and anything else is rethrown so the gateway's onError logs it as a genuine 500 (rather than
// masking server faults like EACCES as 404, which sync would then trust as "file deleted").
function failOrRethrow(error: unknown, set: { status?: number | string }): string {
  if (hasErrorCode(error, 'ValidationError')) {
    set.status = 400
    return 'Bad Request'
  }
  if (hasErrorCode(error, 'FileNotFound')) {
    set.status = 404
    return 'Not Found'
  }
  throw error
}

// Server counterpart of HttpFileSystem: serves any VirtualFileSystem over HTTP
// using the wire contract in ./protocol. Mounted under the `/vfs` prefix to
// match HttpFileSystem's default base URL.
export function vfsRoutes(vfs: VirtualFileSystem): AnyElysia {
  return new Elysia({ prefix: '/vfs' })
    .get(VFS_ROUTES.list, async ({ query, set }): Promise<ListResponse | string> => {
      try {
        const entries = await vfs.list(safePath(query.prefix, { allowEmpty: true }))
        return { entries: entries.map((entry) => ({ pathname: entry.pathname, kind: entry.kind })) }
      } catch (e) {
        return failOrRethrow(e, set)
      }
    })
    .get(VFS_ROUTES.read, async ({ query, set }) => {
      try {
        const bytes = await vfs.read(safePath(query.path, { allowEmpty: false }))
        return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'application/octet-stream' } })
      } catch (e) {
        return failOrRethrow(e, set)
      }
    })
    .put(
      VFS_ROUTES.write,
      async ({ query, body, set }) => {
        try {
          const path = safePath(query.path, { allowEmpty: false })
          if (body.byteLength > MAX_WRITE_BYTES) {
            set.status = 413
            return 'Payload Too Large'
          }
          await vfs.write(path, new Uint8Array(body))
          set.status = 204
          return ''
        } catch (e) {
          return failOrRethrow(e, set)
        }
      },
      { body: t.ArrayBuffer() },
    )
    .delete(VFS_ROUTES.delete, async ({ query, set }) => {
      try {
        await vfs.delete(safePath(query.path, { allowEmpty: false }), { force: query.force === '1', recursive: query.recursive === '1' })
        set.status = 204
        return ''
      } catch (e) {
        return failOrRethrow(e, set)
      }
    })
    .get(VFS_ROUTES.exists, async ({ query, set }): Promise<ExistsResponse | string> => {
      try {
        return { exists: await vfs.exists(safePath(query.path, { allowEmpty: false })) }
      } catch (e) {
        return failOrRethrow(e, set)
      }
    })
    .get(VFS_ROUTES.head, async ({ query, set }) => {
      try {
        return (await vfs.head(safePath(query.path, { allowEmpty: false }))) satisfies FileHeadResponse
      } catch (e) {
        return failOrRethrow(e, set)
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
