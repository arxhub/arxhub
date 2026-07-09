import { definePluginManifest, Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { hasErrorCode } from '@arxhub/errors'
import { GatewayServerExtension } from '@arxhub/plugin-gateway/server'
import type { VirtualFileSystem } from '@arxhub/vfs'
import Elysia, { t } from 'elysia'
import { SYNC_NAMESPACE } from './namespace'
import { decodeObjectFrame } from './remote/decode-object-frame'
import { encodeObjectFrame } from './remote/encode-object-frame'
import type { SyncRemote } from './remote/sync-remote'
import { VfsSyncRemote } from './remote/vfs-sync-remote'

// A put frame carries at most PUT_BATCH_BYTES from the engine plus one chunk (≤ 8 MiB) plus
// per-object framing — 64 MiB is a comfortable ceiling that still bounds a disk-DoS attempt.
const MAX_PUT_FRAME_BYTES = 64 * 1024 * 1024

// Ceilings on the hash-array routes, sized above the engine's client batches (STAT_BATCH = 512,
// GET_BATCH = 32) with headroom. Protocol limits, not tunables: they bound per-request server work
// and — for get, where every hash can resolve to an 8 MiB chunk — the response frame size.
const MAX_STAT_HASHES = 1024
const MAX_GET_HASHES = 64

// The batched object-store routes, named RELATIVELY (`/head`, `/objects/*`). arxhub's gateway mounts
// them under `/api/<namespace>` (gateway.forPlugin), so the paths here carry no prefix — the client's
// baseUrl does (`<origin>/api/sync`, `<origin>/api/publish`, …). THIS function's inferred return type
// is the client contract: `createTypedHttp<ReturnType<…>>` derives its urls + request/response types
// from it, so there are no hand-written route consts or DTO interfaces. Do NOT annotate the return
// `: AnyElysia` — that erases the route tree the client reads. Reused verbatim by publish over an
// unencrypted public store (see @arxhub/plugin-publish).
//
// Handlers return the success value directly (→ 200) or `status(code, …)` for errors, so every status
// is a distinct entry in the route's response type (a bare `set.status = 400; return '…'` would fold
// the error string into the 200 type and poison inference). App-level ValidationError (a bad hash or a
// malformed frame — the network can send either) maps to 400; anything else rethrows so the gateway
// logs a genuine 500 instead of masking a server fault as a client error.
export function objectStoreRoutes(remote: SyncRemote) {
  return (
    new Elysia()
      .get('/head', async () => ({ head: await remote.getHead() }))
      .put(
        '/head',
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
        '/objects/stat',
        async ({ body, status }) => {
          try {
            return { has: [...(await remote.hasObjects(body.hashes))] }
          } catch (e) {
            if (hasErrorCode(e, 'ValidationError')) return status(400, 'Bad Request')
            throw e
          }
        },
        { body: t.Object({ hashes: t.Array(t.String(), { maxItems: MAX_STAT_HASHES }) }) },
      )
      // Returns the object frame as raw bytes. Elysia sends a Uint8Array body verbatim but sets NO
      // content-type, so declare it explicitly — the client keys binary-vs-text parsing off it.
      .post(
        '/objects/get',
        async ({ body, set, status }) => {
          try {
            set.headers['content-type'] = 'application/octet-stream'
            return encodeObjectFrame(await remote.getObjects(body.hashes))
          } catch (e) {
            if (hasErrorCode(e, 'ValidationError')) return status(400, 'Bad Request')
            throw e
          }
        },
        { body: t.Object({ hashes: t.Array(t.String(), { maxItems: MAX_GET_HASHES }) }) },
      )
      .post(
        '/objects/put',
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
export type SyncApp = ReturnType<typeof objectStoreRoutes>

const manifest = definePluginManifest({
  name: 'SyncServer',
  namespace: SYNC_NAMESPACE,
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

// Mounts the sync object store at `/api/sync` during configure(). Register alongside GatewayServerPlugin
// in a server instance, injecting the backing object store (mirrors VfsHttpServerPlugin).
export class SyncServerPlugin extends Plugin {
  private readonly vfs: VirtualFileSystem

  constructor(args: SyncServerPluginArgs) {
    super(args, manifest)
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
