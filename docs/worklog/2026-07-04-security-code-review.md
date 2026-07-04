# 2026-07-04

## Focus
Whole-repo code review (no code changes), with a deep look at server security /
zero-trust and the encryption path. Produced a ranked findings list and an
agreed, tiered fix plan. Follow-up to the 2026-07-03 encrypted-sync + protection
session — this review grades that work.

## Why / what triggered it
- Full code review — triggered by user request ("do codereview of current repo").
  Ran 5 parallel review agents (security/crypto/sync/protection, core infra,
  VFS+gateway, UI layer, instances+toolchain), each briefed with cerebrum's
  intentional-decision list so known-by-design choices weren't re-flagged.
- Focused security/zero-trust assessment — triggered by user's explicit follow-up
  ("what about security and zero-trust for server and encryption?"). Needed to say
  plainly whether the just-built encrypted sync actually earns zero-trust.
- Fix list — triggered by user ("write a list of fixes"). Turned findings into an
  ordered, actionable plan (Tier 1 critical → Tier 3 hygiene → deferred).

## What changed
- No source changes. Review only.
- `docs/worklog/2026-07-04-security-code-review.md`: this entry.
- Untracked `packages/vfs-node/src/__tests__/testdata/vfs-confinement/` exists in
  the tree but predates this session (not created here) — leave or clean as part
  of the symlink-confinement fix (Tier 2 #14).

## State
- Working / verified-good by review: AES-256-GCM cipher (fresh CSPRNG IV per write,
  tag-authenticated), hardened BIP32 derivation, zero-knowledge signed-request auth
  (body hash in canonical string, global onRequest guard covers all routes),
  server never sees seed/keys, `safePath`+`failOrRethrow`+`MAX_WRITE_BYTES` server
  hardening, NodeFileSystem lexical confinement (modulo symlinks), useFileDocument
  ticket/canSave design, DnD cleanup, Promise.allSettled startup, and ZERO
  accidental plugin-registration drift across the 3 SPA instances. Dep audit: all
  20 vulns are build-toolchain only, none at runtime.
- Zero-trust verdict: content is safe vs a passive server, but NOT yet true
  zero-trust. Passive server leaks metadata (plaintext-content hashes as filenames
  → known-content confirmation; chunk/snapshot counts, sizes, sync timing). Active
  malicious server can swap encrypted blobs to corrupt/rollback state undetected
  (no download hash-verify), and can hijack identity at restart (TOFU pin is
  in-memory only). Mnemonic sits plaintext in localStorage — one XSS = full compromise.
- In flight: nothing committed/coded. The fix list below is the deliverable; user
  has not yet said "go". Open decision blocks Tier 1 #9 (see next steps).

## Done this session (follow-up work session, same day)
- [x] Removed `fs:scope-home-recursive` + added `fs:allow-remove` — instances/app/src-tauri/capabilities/default.json
- [x] download() integrity verification — packages/sync/src/repo.ts (snapshot.hash===hash + re-hash each chunk, throw illegalState). Added packages/sync/src/__tests__/repo.test.ts (3 tests, 12/12 sync pass).
- [x] Nonce expiry fix — plugins/protection/src/authenticator.ts (anchor to signed `ts + tolerance`, not server clock). Added clock-skew replay test.
- [x] TOFU pin persistence — RequestAuthenticator gained `onPair` hook; composition roots (instances/server + instances/dev) load `state/protection/pinned-key` before start (treat as fixed pin, ARXHUB_SYNC_PUBKEY still wins) and persist newly-paired key via onPair. Added 2 onPair tests (17/17 protection pass).
- [x] CodeMirror promote-on-edit — plugins/codemirror/src/ui/CodeMirrorEditor.vue (updateListener → panel.promote() on docChanged, guarded by transactions.length>0).
- Logged bug-283/284/285 to .wolf/buglog.json.

## Decided / dropped
- Remote-filename blinding (was Tier 1 #4): DROPPED by design. Content-addressed storage (git-like) is intentional; server only gets a known-content confirmation oracle, acceptable for a personal vault. Blinding would break the model.

## Next steps (open)
- [ ] #8 useFileDocument: catch build()/apply() errors (packages/uikit/src/hooks/useFileDocument.ts:71-76). Currently only read() is wrapped; if build() (e.g. CodeMirror langDesc.load() offline) or apply() throws, loading stays true forever with no error banner / retry — dead panel. Fix: extend the try/catch to cover build+apply, respect the `ticket` staleness guard, set error.value + loading.value=false. Small, no decision needed.
- [ ] #9 PIN-unlocked key at rest (plugins/keystore/src/keystore.ts). Decision made: short PIN unlocks the app and decrypts the stored key; mnemonic never plaintext. Scheme: store AES-256-GCM(Argon2id(PIN, salt), mnemonic) + salt; lock screen re-derives on launch; wrong PIN → GCM auth fail. MUST have slow KDF + lockout (PIN is low-entropy). Also decided: pin value persisted on disk under state (same pattern as TOFU pin now uses). Three open decisions before building: (a) lockout policy — wipe-after-N vs escalating backoff; (b) where the lock screen mounts + idle re-lock vs restart-only; (c) Tauri OS keychain/Stronghold (no PIN prompt on desktop) vs same PIN-wrap everywhere. Plugins have one entry point but adapt by env (OS/client/server) — keystore should branch on platform.
- [ ] Tier 2/3 remainder from the review (HttpFileSystem error swallowing, stableStringify undefined, ArxHub.stop() started flag, useDefineForClassFields:false in 3 SPA tsconfigs, NodeFileSystem symlink realpath + walker visited-set, editor-panel-on-delete/rename, posix.* in explorer, etc.) — not yet started.
- [ ] Deferred (product/infra): gateway body-limit + rate-limit; static SPA serving in instances/server; mount <Toaster>.

Tier 2 (correctness) & Tier 3 (hygiene) — full list in session; highlights:
- [ ] HttpFileSystem list()/exists()/force-delete stop swallowing network/5xx errors (only 404→empty)
- [ ] stableStringify undefined handling + tests (packages/stdlib/src/record/stable-stringify.ts:10)
- [ ] ArxHub.stop() must not reset `started` (packages/core/src/arxhub.ts:91)
- [ ] useDefineForClassFields:false in instances/{app,client,dev}/tsconfig.json
- [ ] NodeFileSystem symlink realpath re-check + walker visited-set (uses the untracked testdata fixture)
- [ ] Close/update open editor panels on delete/rename; frozen EditorToolbar mark state; explorer posix.* paths
- [ ] Deferred (product/infra decision): gateway body-limit + rate-limit; static SPA serving in instances/server; mount <Toaster>

## Open question
- [ ] Which mnemonic-at-rest approach + unlock UX? (blocks Tier 1 #9; everything else in Tier 1 is unblocked)
