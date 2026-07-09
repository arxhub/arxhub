# Security Model

How ArxHub protects a vault that syncs through a server the user may not fully trust — and what it
deliberately does NOT protect against. Read this before exposing a server instance to a network.

## Identity and keys

One BIP39 mnemonic (12 words, 128-bit entropy) is the single human-backupable root secret. Every
purpose-specific key derives from it via **hardened** BIP32 paths (`packages/crypto/src/paths.ts`):

- `m/83696968'/0'` → 32-byte AES-256 content-encryption key
- `m/83696968'/1'` → secp256k1 auth keypair for request signing

Hardened derivation means a leaked child key cannot expose siblings or climb to the root. The server
only ever receives the auth node's **xpub** — no private material leaves the device.

## What the sync server sees (zero-knowledge store)

Every object — content chunks AND snapshot manifests (so pathnames too) — is AES-256-GCM encrypted
with a fresh random 96-bit IV before upload (`EncryptedSyncRemote`). The server stores opaque blobs.

Accepted metadata trade-off: object **addresses** are `sha256(plaintext)`-derived, which keeps
content-addressed dedup working but gives the server a *known-content confirmation oracle* (it can
hash a candidate it already knows and test for its presence) plus chunk-equality/size patterns. If
this ever matters, keyed addresses (`HMAC(key, plaintext)`) close it at the cost of re-addressing
every object.

## Zero-trust pulls

The engine never trusts remote bytes:

- Chunks must hash to the address they were fetched from — **after** decryption.
- Snapshots must prove themselves twice: the declared hash must match the fetched address AND
  `snapshotHash(parent, files)` must reproduce it. The address commits to the parent (like a git
  commit id), so history cannot be rewritten under an unchanged name.
- **Rollback detection**: each device anchors on the head of its last successful sync
  (`repo/last-synced` in local state). A remote head that is not the anchor or a descendant of it —
  or a head that vanished — fails the sync loudly. First-ever sync is trust-on-first-sync; deleting
  the anchor file deliberately re-enters it (the recovery path after an intentional remote reset).

Residual risk: a *persistently* malicious server can still serve different (individually valid)
histories to different devices — a silent partition. Detecting that needs device-signed heads and is
future work.

## Request authentication

Every gateway request carries an ECDSA signature over a canonical string of
`method \n host \n path \n query \n timestamp \n nonce \n sha256(body)`:

- **Freshness**: ±30 s clock skew tolerance.
- **Replay**: nonces are rejected within the freshness window (in-memory — a restart reopens at most
  the 30 s window).
- **Key pinning**: trust-on-first-use; the pinned xpub is persisted (`state/protection/pinned-key`)
  so restarts don't reopen the window. `ARXHUB_SYNC_PUBKEY` overrides and disables TOFU entirely.
- **Host binding**: the signature covers the host the client targeted, so a captured request can't
  be replayed against a different server pinning the same key.
- **Body bound**: the guard refuses bodies over 64 MiB (413) *before* buffering them for the hash,
  so unauthenticated traffic can't exhaust memory.

The ONE anonymous surface is method-restricted GET under the published-content prefix
(`/api/publish/public/*`), which only resolves paths listed in the publish manifest.

## Deployment requirements (server instance)

1. **HTTPS is mandatory for anything beyond localhost.** Request signing authenticates the CLIENT
   only — server responses are not signed. Without TLS, a MITM cannot forge content (GCM + hash
   checks catch it) but CAN forge control-plane answers (`getHead`, `hasObjects`) to hide data or
   delay convergence. Terminate TLS at a reverse proxy.
2. **The reverse proxy MUST forward `Host` unchanged** (nginx: `proxy_set_header Host $host`) — the
   host is inside the signed canonical string; rewriting it fails every request closed.
3. **Close the TOFU window before exposing the port**: set `ARXHUB_SYNC_PUBKEY` to the device xpub,
   or complete the first sync over a private network. Until a key is pinned, the first valid signer
   becomes the paired device (the server logs a loud warning while the window is open).
   Recovery from a wrong pin: delete `state/protection/pinned-key` and restart.
4. Optionally cap request bodies at the proxy as well (`client_max_body_size 64m`) — defense in
   depth in front of the guard's own limit.
5. **Single node only.** Nonce replay tracking and the head compare-and-swap are in-process; running
   replicas breaks both.

## Trust models by instance

- `app` / `dev` syncing to a remote server: the server is **untrusted** — it holds ciphertext only.
- `client` (pure SPA over vfs-http): the server holds the **plaintext working tree** under
  `~/.arxhub`. Auth gates access, but this topology requires a *trusted* (self-hosted) server. Do
  not point it at infrastructure you wouldn't hand your notes to.

## Known limitations (accepted, tracked)

- The device mnemonic rests in `localStorage` (plaintext at rest, XSS-reachable). Planned: OS
  keychain/stronghold backend for Tauri; the `KeyStore` interface is already async for this.
- No fork detection across devices without device-signed heads (see rollback section).
- Nonce map and TOFU pin assume a single server process (see deployment).
