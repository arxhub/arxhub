# ADR: Per-Plugin Home, Scoped VFS, and Permissions

## 1. Context

Originally every plugin received the **same unscoped root `VirtualFileSystem`** (via `VfsExtension.vfs`), and `@arxhub/config` computed a flat `config/<pluginId>.toml` path. Consequences:

- **No isolation.** Any plugin could read or write anywhere in the tree, including other plugins' data and the sync engine's own state.
- **No place for non-synced data.** There was nowhere to put per-plugin caches or machine-local state that must *not* be synced or backed up.
- **Config owned the path layout.** The storage location of a plugin's settings was baked into the config package rather than the plugin's identity.

We want each plugin to get its own **home directory** — like an app's data dir — split by two axes (synced-vs-local, durable-vs-disposable), with privileged cross-tree access (e.g. the sync/repo engine reading the whole tree) granted explicitly. The model is informed by SiYuan's workspace layout (`data/` synced vs `repo/`/`temp/` local) and the XDG base directories, and the permission format mirrors Tauri's `fs:scope` (`instances/app/src-tauri/capabilities/default.json`).

## 2. Decision

### 2.1 Folder layout (single VFS, split by top-level folder)

One real `VirtualFileSystem` per instance, partitioned by reserved top-level folders:

| Folder | Purpose | Synced? | Durable? |
|--------|---------|---------|----------|
| `vault/` | user content (Explorer/Editor) | yes | yes |
| `storage/<id>/` | plugin config + data (`config.toml` + named files) | yes | yes |
| `state/<id>/` | repo store, cursors, device-local prefs | **no** | yes |
| `temp/<id>/` | disposable cache | **no** | no |

Sync walks `vault/` + `storage/` only; `state/` and `temp/` are simply never handed to the repo engine — that is the entire enforcement mechanism (no per-file ignore lists). The repo engine's own store therefore lives in `state/` and can never chunk itself.

### 2.2 Scoped VFS + Tauri-style permissions

`@arxhub/vfs` gains `ScopedFileSystem(inner, prefix, scope?)` — a `VirtualFileSystem` decorator that roots every operation at `prefix` and optionally enforces an allow/deny `scope` (Tauri `fs:scope` shape). Path-escape via `..` is rejected; `walk`/`list` strip the prefix on the way out.

A plugin declares access in its manifest:

```jsonc
"permissions": [
  "vfs:default",
  { "identifier": "vfs:scope", "allow": [{ "path": "vault/**" }, { "path": "storage/**" }] }
]
```

The plugin's **home is its default grant**; extra scopes are explicit. We use the term **permissions** (never "capabilities"), matching Tauri and the Android mental model.

### 2.3 Delivery via a scoped DI container

`@arxhub/stdlib`'s `LazyContainer` becomes **hierarchical**: `get()`/`has()` resolve locally first and fall through to an optional `parent` ("check locally, else go to parent"); parent-owned singletons stay shared; `child(domain?)` mints a sub-scope.

- `ArxHub.services` is the root scope. Each instance binds the concrete root vfs there as `RootVfs`.
- Each plugin receives its **own child scope** (`services.child()`) via `PluginArgs.container`.
- The base `Plugin` constructor seeds `PluginHome` into its own scope from `this.manifest` — so **Core, not the subclass, owns the home id**. Plugins obtain storage via `this.container.get(PluginHome)` → `{ storage, state, temp, granted(scopeId) }`.

`@arxhub/config`'s `readConfig`/`writeConfig` drop the `pluginId` argument and take a (scoped) vfs + optional `name` (default `config`). `VfsExtension` is repurposed to expose the shared **vault content view** (`ScopedFileSystem(root, 'vault')`) for the editor/explorer/codemirror UI — never the raw root.

### 2.4 VFS path invariant: always POSIX (`/`)

**VFS logical pathnames are a virtual POSIX namespace — always `/`, on every runtime and OS.** This is a hard contract for every `VirtualFileSystem` implementation and every consumer.

The subtlety: `@arxhub/path` is a **platform-conditional** shim — its `node` condition re-exports `node:path` (which is `\`-delimited on Windows), while `browser`/`default` use `path-browserify` (always `/`). So its bare `join`/`normalize`/`dirname`/`sep` are **not safe** for logical paths on Node+Windows.

Rules:

1. Code that manipulates VFS logical paths uses `@arxhub/path`'s guaranteed-POSIX `posix.*` API (added in both build variants — `node:path.posix` on Node, path-browserify in the browser), never the bare conditional exports. `normalizePath` (leading-slash strip) is identical in both and stays.
2. **Separator translation happens at exactly one place: the OS boundary inside `vfs-node`.** `node:path` is used only to build the OS path passed to `fs.*`; any pathname *returned into* the VFS is constructed from the logical prefix + bare `readdir` filename joined with `/` — never by slicing an OS path.
3. The HTTP and Tauri implementations speak `/` over the wire and need no translation.

## 3. Consequences

**Positive**
- Plugins are sandboxed: a plugin sees only its own `storage`/`state`/`temp` unless it declares an explicit `vfs:scope`. A scope violation throws `ScopeAccessDenied` (403).
- Non-synced data has a clear home (`state/`, `temp/`); the sync engine's store sits in `state/` and structurally cannot chunk itself.
- Config no longer owns path layout; storage location follows plugin identity.
- One permission model end-to-end, matching the native fs layer already used in `src-tauri/capabilities`.
- The `/`-only invariant + isolated OS-boundary translation fixes a latent Windows bug in `vfs-node` (it previously leaked `\` into logical pathnames via OS-path slicing).

**Negative / trade-offs**
- In the HTTP-backed deployments (`dev`/`client`), "local" `state/`/`temp/` are physically stored on the server (single backend); the sync-exclusion guarantee still holds, but they are not truly machine-local there. The Tauri `app` has a genuinely local backend.
- New dependency edge `@arxhub/core → @arxhub/vfs` (acyclic).
- `VfsExtension` is now a vault-scoped content view, not the raw root — a deliberate narrowing that consumers must respect.

## 4. Status

Accepted and implemented (2026-06). Verified via unit/integration tests (`@arxhub/vfs`, `@arxhub/stdlib`, `@arxhub/core`, `@arxhub/sync`). Note: the repo's strict `tsc && vite build` is broken independently of this work (bleeding-edge TS/vite tooling); verification uses `pnpm --filter <pkg> test` and per-instance `vue-tsc`.

## 5. Future work

- An ADR/spec for a fuller permission catalog (richer `vfs:*` identifiers, network/other resource permissions).
- Installable plugin **code** bundles (SiYuan's `data/plugins/<id>/`) once plugins are installed rather than compiled in.
- Possibly a true machine-local backend for `state/`/`temp/` in the HTTP deployments.
