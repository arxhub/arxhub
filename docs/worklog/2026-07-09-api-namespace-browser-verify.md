# 2026-07-09

## Focus
Finished the typed-HTTP-client migration: made `/api/<namespace>` a single source of truth, then drove a real browser to verify the app renders and sync configures + runs end-to-end — which turned up (and fixed) a genuine boot-crash bug.

## Why / what triggered it
- **`/api/<namespace>` shared-namespace refactor** — triggered by "are there hardcoded prefix consts left?" after the migration. The `/api` prefix + each plugin's namespace were restated as literals in clients, instances, and the guard allowlist — free to drift from the gateway. Centralized so there's one definition.
- **Migrate `@arxhub/vfs-http` to the typed client** — triggered by the audit "did all HTTP packages migrate?" vfs-http was the last one still on raw `createHttpClient` + `VFS_ROUTES`/DTOs. Also fixed its pre-existing `override` tsc error along the way.
- **"start the app, debug it, configure sync"** — triggered by the user wanting to see it work in a real browser. No Chrome MCP / Playwright here, so I drove the installed Chrome via a throwaway `puppeteer-core` harness.
- **Browser-safe sha256** — triggered by the browser debugging: the SPA never mounted. Root cause found via the page console — `@arxhub/stdlib/crypto/sha256` used `node:crypto`, and `@arxhub/sync`'s `empty-snapshot-hash` calls it at module top-level, so importing `@arxhub/sync` (every instance) threw on boot. Real regression, only visible in a browser.
- **stdlib `types:[node]`** — triggered by the sha256 commit surfacing pre-existing `node:fs/promises` TS2591 errors; `stdlib/tsconfig.json` lacked `"types": ["node"]` (unlike `vfs-node`).

## What changed
- `packages/core`: `API_PREFIX` + `apiBaseUrl(origin, namespace)`. Each domain package exports its namespace once (`SYNC_NAMESPACE`/`PUBLISH_NAMESPACE`/`VFS_NAMESPACE`), used by both its server `manifest.namespace` and its client baseUrl; `PUBLIC_READ_PATH` derives from it. No `/api/<ns>` literals remain. (`2ae1463`)
- `packages/vfs-http`: `HttpFileSystem` = `createTypedHttp<VfsApp>`; `vfsRoutes` relative + typed query + `status()`; deleted `protocol.ts` (VFS_ROUTES + DTOs); fixed `lock`/`acquireLock` `override`. (`e7bfb03`)
- `packages/stdlib`: `crypto/sha256` → `@noble/hashes` (browser-safe, identical hex; `EMPTY_SNAPSHOT_HASH` unchanged). (`95b1a19`) + `tsconfig` `types:[node]`. (`8b9a143`)
- `chunker.test`: `VirtualEntry[]` → `vfs.file(pathname)`. (`352357f`)

## State
- Working: all HTTP packages typecheck clean; **stdlib now tsc-clean too**. Tests: sync 26/26, publish 6/6, vfs-http 10/10, protection 22/22. Git tree clean; commits `6e9437d`→`8b9a143`.
- Browser-verified (puppeteer, since removed): dev SPA mounts; VFS calls 200/204 (signed, TOFU-paired); **sync configured via Settings UI → footer "Synced", server repo received head+object over `/api/sync`**.
- Typed-HTTP-client + `/api/<namespace>` migration is COMPLETE and proven in-app.

## Next steps
- [ ] Roadmap (`.claude/plans/what-our-next-steps-woolly-nova.md` is stale — crypto/auth/encryption all done). Real remaining MVP gaps:
  - [ ] **Two-device encrypted sync round-trip** — verify a note edited on client A reaches client B via the server, and the server's on-disk chunks are ciphertext. (Single-device self-sync already proven this session.)
  - [ ] **Save-failure toast** — mount `<Toaster>` in the shell; replace editor/codemirror logger TODOs so failed VFS writes are visible. Small, self-contained, no interactivity needed.
  - [ ] **Auto-sync trigger** — currently manual-button only; consider debounced sync on save / interval.
  - [ ] **Tauri `tauri dev` verification** — `instances/app` native FS path never exercised (needs an interactive desktop session).
  - [ ] **Mnemonic UX** — view/copy/QR over the raw Security settings field (QR PC↔phone pairing is backlog).
- [ ] Note: driving the browser needs a Chrome/Playwright MCP for a repeatable setup; this session used a temporary `puppeteer-core` (removed after).
