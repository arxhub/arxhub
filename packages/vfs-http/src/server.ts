import { definePluginManifest, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { hasErrorCode, validation } from '@arxhub/errors'
import { GatewayServerExtension } from '@arxhub/plugin-gateway/server'
import { readRange, type VirtualFileSystem } from '@arxhub/vfs'
import Elysia, { t } from 'elysia'
import { matchesToken, parseExpectedToken } from './compare-and-swap-token'
import { VFS_NAMESPACE } from './namespace'

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
export function safePath(raw: unknown, { allowEmpty }: { allowEmpty: boolean }): string {
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
export function failOrRethrow(error: unknown, set: { status?: number | string }): string {
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

// Server counterpart of HttpFileSystem: serves any VirtualFileSystem over HTTP. Routes are RELATIVE
// (`/list`, `/read`, …) with query typed via `t.Object`; arxhub's gateway mounts them under `/api/vfs`
// (gateway.forPlugin), which the client's baseUrl carries. This function's inferred return type is the
// client contract — `HttpFileSystem` is `createTypedHttp<VfsApp>`, so there are no route consts or DTOs.
//
// Each handler maps errors inline via `status(code, …)` — missing file → 404, rejected path → 400,
// everything else rethrows (a genuine 500). Inlined (not the shared failOrRethrow) so every status is a
// distinct entry in the route's response type; a `set.status`+string return would poison the typed client.
export function vfsRoutes(vfs: VirtualFileSystem) {
  return (
    new Elysia()
      .get(
        '/list',
        async ({ query, status }) => {
          try {
            const entries = await vfs.list(safePath(query.prefix, { allowEmpty: true }))
            return { entries: entries.map((entry) => ({ pathname: entry.pathname, kind: entry.kind })) }
          } catch (e) {
            if (hasErrorCode(e, 'ValidationError')) return status(400, 'Bad Request')
            throw e
          }
        },
        { query: t.Object({ prefix: t.Optional(t.String()) }) },
      )
      // Raw file bytes; Elysia sends a Uint8Array verbatim but sets no content-type, so declare it.
      .get(
        '/read',
        async ({ query, set, status }) => {
          try {
            set.headers['content-type'] = 'application/octet-stream'
            return new Uint8Array(await vfs.read(safePath(query.path, { allowEmpty: false })))
          } catch (e) {
            if (hasErrorCode(e, 'FileNotFound')) return status(404, 'Not Found')
            if (hasErrorCode(e, 'ValidationError')) return status(400, 'Bad Request')
            throw e
          }
        },
        { query: t.Object({ path: t.Optional(t.String()) }) },
      )
      // A query route, not the HTTP `Range` header: the client here is our own typed, SIGNED client, and
      // the grammar (a suffix range, clamping instead of a 416) belongs to the VFS, not to HTTP. A media
      // element that needs a real `Range`-serving URL is a different door and this is not it.
      .get(
        '/read-range',
        async ({ query, set, status }) => {
          try {
            const offset = Number(query.offset ?? 0)
            const length = query.length ? Number(query.length) : undefined
            set.headers['content-type'] = 'application/octet-stream'
            return await readRange(vfs, safePath(query.path, { allowEmpty: false }), offset, length)
          } catch (e) {
            if (hasErrorCode(e, 'FileNotFound')) return status(404, 'Not Found')
            if (hasErrorCode(e, 'ValidationError')) return status(400, 'Bad Request')
            throw e
          }
        },
        { query: t.Object({ path: t.Optional(t.String()), offset: t.Optional(t.String()), length: t.Optional(t.String()) }) },
      )
      .put(
        '/write',
        async ({ query, body, status }) => {
          if (body.byteLength > MAX_WRITE_BYTES) return status(413, 'Payload Too Large')
          try {
            await vfs.write(safePath(query.path, { allowEmpty: false }), new Uint8Array(body))
            return new Response(null, { status: 204 })
          } catch (e) {
            if (hasErrorCode(e, 'ValidationError')) return status(400, 'Bad Request')
            throw e
          }
        },
        { query: t.Object({ path: t.Optional(t.String()) }), body: t.ArrayBuffer() },
      )
      // The compare-and-swap the browser cannot do itself: its VFS is stateless requests, so the compare
      // and the write have to happen where the file is. `expected` is the sha256 of what the client
      // last saw, or `absent` (see compare-and-swap-token.ts); the body is what to write if it still
      // holds. Read-compare-write runs under the server VFS's own path lock, and the write is the RAW
      // `vfs.write` — VirtualFile.write() would take the same non-re-entrant lock. 409 is the honest
      // "someone else moved it first", which the client turns back into `false`.
      .put(
        '/compare-and-swap',
        async ({ query, body, status }) => {
          if (body.byteLength > MAX_WRITE_BYTES) return status(413, 'Payload Too Large')
          try {
            const path = safePath(query.path, { allowEmpty: false })
            const token = parseExpectedToken(query.expected)
            const swapped = await vfs.lock(path, async () => {
              let current: Uint8Array | null
              try {
                current = await vfs.read(path)
              } catch (e) {
                if (!hasErrorCode(e, 'FileNotFound')) throw e
                current = null
              }
              if (!matchesToken(current, token)) return false
              await vfs.write(path, new Uint8Array(body))
              return true
            })
            return swapped ? new Response(null, { status: 204 }) : status(409, 'Conflict')
          } catch (e) {
            if (hasErrorCode(e, 'ValidationError')) return status(400, 'Bad Request')
            throw e
          }
        },
        { query: t.Object({ path: t.Optional(t.String()), expected: t.Optional(t.String()) }), body: t.ArrayBuffer() },
      )
      .delete(
        '/delete',
        async ({ query, status }) => {
          try {
            await vfs.delete(safePath(query.path, { allowEmpty: false }), { force: query.force === '1', recursive: query.recursive === '1' })
            return new Response(null, { status: 204 })
          } catch (e) {
            if (hasErrorCode(e, 'FileNotFound')) return status(404, 'Not Found')
            if (hasErrorCode(e, 'ValidationError')) return status(400, 'Bad Request')
            throw e
          }
        },
        { query: t.Object({ path: t.Optional(t.String()), force: t.Optional(t.String()), recursive: t.Optional(t.String()) }) },
      )
      .get(
        '/exists',
        async ({ query, status }) => {
          try {
            return { exists: await vfs.exists(safePath(query.path, { allowEmpty: false })) }
          } catch (e) {
            if (hasErrorCode(e, 'ValidationError')) return status(400, 'Bad Request')
            throw e
          }
        },
        { query: t.Object({ path: t.Optional(t.String()) }) },
      )
      .get(
        '/head',
        async ({ query, status }) => {
          try {
            return await vfs.head(safePath(query.path, { allowEmpty: false }))
          } catch (e) {
            if (hasErrorCode(e, 'FileNotFound')) return status(404, 'Not Found')
            if (hasErrorCode(e, 'ValidationError')) return status(400, 'Bad Request')
            throw e
          }
        },
        { query: t.Object({ path: t.Optional(t.String()) }) },
      )
  )
}

// The exported route-tree type the client infers from. `import type { VfsApp } from '@arxhub/vfs-http/server'`.
export type VfsApp = ReturnType<typeof vfsRoutes>

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

// Mounts vfsRoutes onto the gateway during configure(). Register alongside
// GatewayServerPlugin in a server instance, injecting the backing filesystem.
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
