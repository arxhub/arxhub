# 2026-07-03

## Focus
Built the encrypted-sync + request-authentication pillar for MVP: a BIP39-rooted identity that both encrypts sync content and authenticates every `/vfs` request, split into a dedicated `@arxhub/plugin-protection` plugin separate from sync.

## Why / what triggered it
- **"What are our next steps to complete MVP?"** — audited project state: local editing works end-to-end, but two PRODUCT.md pillars were missing — encrypted sync (engine wrote plaintext) and any auth (HTTP VFS served the whole filesystem unauthenticated). User chose the full scope: both surfaces, encrypted sync, auth-before-remote.
- **BIP32 as the key source** — user wanted an ownable, portable secret (backup-able word list, later shareable PC↔phone via QR) instead of a passphrase+PBKDF2. One mnemonic derives both the content-encryption key and the auth key.
- **Auth scheme** — user first proposed "encrypt a constant string → use as token"; flagged it as a replayable static token. Chose the stronger zero-knowledge **signed-challenge** instead (server pins the client xpub, never holds a secret). Same UX, replay-resistant.
- **TOFU pairing + uniform `/vfs` protection** — user accepted first-use-wins pinning and wanted nothing exposed by default. This forced **auto-generating a mnemonic on first run** so the always-protected working-tree VFS is reachable out of the box.
- **"Make sync and protection separate plugins"** — user directive mid-session; auth is now its own plugin, sync just consumes the keyring via an extension.

## What changed
- `packages/crypto`: new `mnemonic/keyring/cipher/auth/paths/errors/request-auth.ts` — BIP39→keyring, AES-256-GCM, secp256k1 sign/`verifyAuth`, signed-request protocol + `MutableRequestSigner`. Deps: `@scure/bip39`, `@scure/bip32`, `@noble/ciphers`, `@noble/hashes`. 25 tests.
- `packages/vfs`: new `encrypting-file-system.ts` — `EncryptingFileSystem` decorator (encrypt content, pass names/listing through). 6 tests (23 vfs total).
- `packages/http` + `packages/vfs-http`: signing middleware attaches auth headers to every request; `HttpFileSystem` takes a `signer`.
- `plugins/protection/` (NEW): client `/ui` (`KeyringExtension`, Security settings, signer install, first-run mnemonic gen) + server `/server` (global Elysia guard + `RequestAuthenticator`: freshness window, nonce replay, TOFU pin). 14 tests incl. Elysia `.handle()` integration.
- `plugins/sync/sync-plugin.ts`: consumes `KeyringExtension`, wraps remote VFS in `EncryptingFileSystem`, signs remote requests.
- Instances dev/app/client/server: register protection, create+pass the shared signer. **client** also gained the missing Settings+Sync (surface-drift closed).
- `packages/sync/README.md`: reconciled — engine is crypto-agnostic; encryption applied above it by the plugin.

## State
- Working / verified: 81 tests green across crypto/vfs/vfs-http/protection/sync. Dev stand boots clean; unsigned `GET`/`PUT /vfs/*` → **401** (direct + proxied); signed → **200/204** with TOFU pinning (integration test). Wrong key → `DecryptionError`; backend blobs confirmed ciphertext.
- In flight: **everything is uncommitted** — one large working tree (new `plugins/protection/`, new `packages/crypto` source files, 21 modified files). Not yet committed pending user review.
- Note/risk: mnemonic currently lives in plaintext plugin config (TOML on the user's own device) — acceptable MVP tradeoff, keychain later. TOFU re-pin needed if the mnemonic changes (server rejects the new key until re-paired).

## Next steps
- [ ] Commit the work (direct to `main`, no Co-Authored-By). Likely split: crypto foundation → vfs EncryptingFileSystem → http/vfs-http signer → plugin-protection → sync refactor → instance wiring.
- [ ] Live two-device encrypted sync round-trip (edit on client A → sync → server ciphertext → sync to client B). Only unit/integration-tested so far, not a real end-to-end sync run.
- [ ] Verify Tauri desktop (`pnpm --filter app tauri dev`) — native VFS path never exercised; confirm protection + app boot in the native window.
- [ ] Friendlier mnemonic UI: view/copy/regenerate in Security settings (raw text field today); later the QR PC↔phone share (backlogged).
- [ ] Save-failure toast (existing editor TODO) — mount `<Toaster>` in the shell.
- [ ] Decision pending: persist the server's TOFU-pinned key across restarts (in-memory today → re-pins on restart) vs. keep env-pin (`ARXHUB_SYNC_PUBKEY`) for production.
