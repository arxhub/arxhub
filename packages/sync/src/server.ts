import { definePluginManifest, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { hasErrorCode } from '@arxhub/errors'
import { GatewayServerExtension } from '@arxhub/plugin-gateway/server'
import type { VirtualFileSystem } from '@arxhub/vfs'
import Elysia, { type AnyElysia, t } from 'elysia'
import { decodeObjectFrame } from './remote/decode-object-frame'
import { encodeObjectFrame } from './remote/encode-object-frame'
import type { SyncRemote } from './remote/sync-remote'
import { VfsSyncRemote } from './remote/vfs-sync-remote'

// A put frame carries at most PUT_BATCH_BYTES from the engine plus one chunk (≤ 8 MiB) plus
// per-object framing — 64 MiB is a comfortable ceiling that still bounds a disk-DoS attempt.
const MAX_PUT_FRAME_BYTES = 64 * 1024 * 1024

// Prefix-free sync object-store routes. THIS function's inferred return type is the client contract:
// `HttpSyncRemote` is `createTypedHttp<SyncApp>` and derives its urls + request/response types from it,
// so there are no hand-written route consts or DTO interfaces to keep in sync. Do NOT annotate the
// return `: AnyElysia` — that erases the route tree the client reads.
//
// Handlers return the success value directly (→ 200) or `status(code, …)` for errors, so every status
// is a distinct entry in the route's response type (a bare `set.status = 400; return '…'` would fold
// the error string into the 200 type and poison inference). App-level ValidationError (a bad hash or a
// malformed frame — the network can send either) maps to 400; anything else rethrows so the gateway
// logs a genuine 500 instead of masking a server fault as a client error.
export function syncRoutes(remote: SyncRemote) {
  return (
    new Elysia()
      .get('/sync/head', async () => ({ head: await remote.getHead() }))
      .put(
        '/sync/head',
        async ({ body, status }) => {
          try {
            // Compare-and-swap: 409 tells the client another device moved the head first — re-sync.
            // Explicit null-body 204: a 204 must not carry a body, and Elysia's status(204) wraps one,
            // which the Response constructor rejects.
            return (await remote.setHead(body.expected, body.next)) ? new Response(null, { status: 204 }) : status(409, 'Conflict')
          } catch (e) {
            if (hasErrorCode(e, 'ValidationError')) return status(400, 'Bad Request')
            throw e
          }
        },
        { body: t.Object({ expected: t.Union([t.String(), t.Null()]), next: t.String() }) },
      )
      .post(
        '/sync/objects/stat',
        async ({ body, status }) => {
          try {
            return { has: [...(await remote.hasObjects(body.hashes))] }
          } catch (e) {
            if (hasErrorCode(e, 'ValidationError')) return status(400, 'Bad Request')
            throw e
          }
        },
        { body: t.Object({ hashes: t.Array(t.String()) }) },
      )
      // Returns the object frame as raw bytes. Elysia sends a Uint8Array body verbatim but sets NO
      // content-type, so declare it explicitly — the client keys binary-vs-text parsing off it.
      .post(
        '/sync/objects/get',
        async ({ body, set, status }) => {
          try {
            set.headers['content-type'] = 'application/octet-stream'
            return encodeObjectFrame(await remote.getObjects(body.hashes))
          } catch (e) {
            if (hasErrorCode(e, 'ValidationError')) return status(400, 'Bad Request')
            throw e
          }
        },
        { body: t.Object({ hashes: t.Array(t.String()) }) },
      )
      .post(
        '/sync/objects/put',
        async ({ body, status }) => {
          if (body.byteLength > MAX_PUT_FRAME_BYTES) return status(413, 'Payload Too Large')
          try {
            await remote.putObjects(decodeObjectFrame(new Uint8Array(body)))
            return new Response(null, { status: 204 })
          } catch (e) {
            if (hasErrorCode(e, 'ValidationError')) return status(400, 'Bad Request')
            throw e
          }
        },
        { body: t.ArrayBuffer() },
      )
  )
}

// The exported route-tree type the client infers from. `import type { SyncApp } from '@arxhub/sync/server'`.
export type SyncApp = ReturnType<typeof syncRoutes>

// Mount the (prefix-free) sync routes under `prefix` (default /sync). Kept separate from syncRoutes so
// SyncApp stays prefix-free: the client's baseUrl carries the prefix, which lets publish reuse these
// same routes at `/publish` over an unencrypted public store. The protection guard (global onRequest)
// covers these routes like every other mounted route.
export function mountSyncRoutes(remote: SyncRemote): AnyElysia {
  return new Elysia().use(syncRoutes(remote))
}

const manifest = definePluginManifest({
  name: 'SyncServer',
  version: '0.1.0',
  author: 'arxhub',
  description: 'Serves the batched sync object-store protocol over HTTP',
})

type SyncServerPluginArgs = PluginArgs & {
  // Root for the sync object store (`/head`, `/objects/...`) — typically a ScopedFileSystem over the
  // instance root, e.g. `new ScopedFileSystem(vfs, 'repo')`. The server stores opaque
  // (client-encrypted) blobs here and never interprets them.
  vfs: VirtualFileSystem
}

// Mounts the sync routes onto the gateway during configure(). Register alongside GatewayServerPlugin in
// a server instance, injecting the backing object store (mirrors VfsHttpServerPlugin).
export class SyncServerPlugin extends Plugin {
  private readonly vfs: VirtualFileSystem

  constructor(args: SyncServerPluginArgs) {
    super(args, manifest)
    this.vfs = args.vfs
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    const { gateway } = ctx.extensions.get(GatewayServerExtension)
    gateway.use(mountSyncRoutes(new VfsSyncRemote(this.vfs)))
  }
}
