# 2026-07-05

## Focus
Built a typed HTTP client inferred from Elysia route types, made `@arxhub/http` a minimal wretch wrapper, and migrated sync + publish onto it — then reshaped route mounting so arxhub's gateway bakes an `/api/<namespace>` prefix automatically.

## Why / what triggered it
- **Typed HTTP client (`createTypedHttp`)** — triggered by the question "can we dedupe the sync package? Elysia has good typing for an HTTP client out of the box." Rejected adopting Eden Treaty (opaque-binary payloads, custom request signing, browser/node split) and hand-writing a full `_routes` type-walker (fragile). Built our own client over wretch whose url/body/query/path-param/response types are inferred from `App['~Routes']` — killing the hand-maintained route consts + parallel request/response DTO interfaces (the actual duplication).
- **`@arxhub/http` made minimal** — triggered by "make http minimal without extra deps." Dropped `@arxhub/crypto`; `createHttpClient` now takes `{ fetch, middlewares }`. Signing moved to `@arxhub/crypto`'s `signingMiddleware` (wretch coupling isolated behind a type-only import).
- **Sync migration** — apply the typed client to the real sync object-store client/server; delete `SYNC_ROUTES` + DTO interfaces.
- **Publish "serves raw public data"** — triggered by user: published content is *public data*, not server-rendered HTML; the client renders. Removed the server-side md/.arx→HTML pipeline from `/p`; it now serves raw source bytes + manifest.
- **`/api/<namespace>` gateway mounting** — triggered by user: the `/api/<pluginName>` prefix must be applied automatically by arxhub, not hardcoded in routes or consts. Routes are now prefix-free; a plugin declares `manifest.namespace` and mounts via a per-plugin wrapped gateway. (Reversed an earlier hardcoded-`/sync` detour that caused a double-prefix — see commit history.)

## What changed
- `packages/http`: new `typed-client.ts` (`createTypedHttp`, `isHttpError`, `TypedHttp`, `Endpoints`) + type tests; `index.ts` minimal, crypto dep removed. (`478b94a`)
- `packages/crypto`: new `request-auth-middleware.ts` (`signingMiddleware`, `describeRequest`); `wretch` type-only dep. (`478b94a`)
- `packages/sync`: `objectStoreRoutes` (prefix-free) + `SyncApp`; `HttpSyncRemote` = `createTypedHttp<SyncApp>`, relative paths; `protocol.ts` reduced then removed. (`6e9437d`, `111b73e`)
- `packages/core`: `PluginManifest.namespace?`. `plugins/gateway`: `NamespacedGateway` + `GatewayServerExtension.forPlugin(plugin)` → `/api/<namespace>`. (`111b73e`)
- `plugins/publish`: reuses `objectStoreRoutes` + `HttpSyncRemote` at `/api/publish` (duplicate `PublishRemote` dropped); `/p`→`/public` raw-only; `render/` pipeline deleted. `packages/vfs-http` → `/api/vfs`. Instances/proxy/guard rewired. (`111b73e`)
- `packages/vfs-http`: `HttpFileSystem` = `createTypedHttp<VfsApp>`; `vfsRoutes` relative + typed query (`?path=`/`?prefix=`) + `status()` responses; deleted `protocol.ts` (`VFS_ROUTES` + DTOs). Fixed the pre-existing `lock`/`acquireLock` `override`. (`e7bfb03`)

## State
- Working: all HTTP packages typecheck clean — `@arxhub/http`, `@arxhub/crypto`, `@arxhub/plugin-gateway`, `@arxhub/core`, **`@arxhub/vfs-http`** (was red on `override`, now green). Tests: sync 26/26, publish 6/6, protection 22/22, vfs-http 10/10. Commits `478b94a`, `6e9437d`, `111b73e`, `e7bfb03`; tree clean.
- Typed-client migration COMPLETE: sync + publish + vfs-http. No raw `createHttpClient` callers remain (it's just the internal primitive under `createTypedHttp`).

## Next steps
- [ ] **Only real open defect:** `packages/sync/src/__tests__/chunker.test.ts:34` — `vfs.list()` returns `VirtualEntry[]` but `chunker.merge()` wants `VirtualFile[]`, so `@arxhub/sync`'s `tsc`/`build` fails. Pre-existing VFS-API WIP, unrelated to the HTTP work. Decide `merge()`'s intended signature (accept entries, or map entries→files in the test), then fix.
- [x] ~~vfs-http `override` on `lock`/`acquireLock`~~ — fixed in `e7bfb03`.
- [x] ~~Migrate `HttpFileSystem` onto `createTypedHttp`~~ — done in `e7bfb03`.
- [ ] Optional: client-side `/api/sync`/`/api/publish`/`/api/vfs` baseUrls are still literals in plugins/instances. Could derive from a shared namespace value — minor.
- [ ] Note: `PUBLIC_READ_PATH` (`/api/publish/public`) is the one unavoidable const — the guard's allowlist needs the full path (`/api` + `publish` namespace + `/public` route). Everything else is prefix-free.
