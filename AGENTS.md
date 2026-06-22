# ARXHUB — PROJECT KNOWLEDGE BASE

## OVERVIEW

ArxHub is a modular personal knowledge management system — a pnpm TypeScript monorepo structured around a plugin/extension lifecycle system (Core), virtual file abstraction (VFS), offline-first sync with Rabin chunking (Sync), and an HTTP gateway (Elysia). UI is Vue 3 + Radix Colors CSS.

## STRUCTURE

```
arxhub/
├── packages/         # Core publishable libraries
│   ├── core/         # Plugin/Extension lifecycle orchestrator — start here
│   ├── stdlib/       # Cross-cutting utilities (collections, fs, record, crypto)
│   ├── errors/       # AppError base + HTTP error factories/schemas
│   ├── events/       # Typed EventBus (EventEmitter3 + declaration-merged EventMap)
│   ├── config/       # TOML config read/write (typebox-defaulted) + ConfigForm.vue
│   ├── http/         # HTTP client factory (wretch wrapper)
│   ├── vfs/          # Virtual file system abstraction (interface + impls of file/dir/walker/info)
│   ├── vfs-node/     # Node.js VFS implementation
│   ├── vfs-tauri/    # Tauri VFS (native filesystem, @tauri-apps/plugin-fs)
│   ├── vfs-http/     # HTTP VFS — client (HttpFileSystem) + server (vfsRoutes)
│   ├── sync/         # Offline-first sync engine (Rabin chunking + snapshots)
│   ├── uikit/        # Vue 3 UI library — multi-entry: core / hooks
│   ├── theme-preset/ # Radix Colors CSS variables (design tokens)
│   ├── crypto/       # Browser crypto shim (crypto-browserify) — dual node/browser entry
│   └── path/         # Browser path shim (path-browserify) — dual node/browser entry
├── plugins/          # Feature plugins (all communicate only via extensions)
│   ├── shell/        # App shell: header/footer/sidebar registries, MiniAppShell rail+content
│   ├── panels/       # Tiling/tabbed panel store + drag-and-drop layout (ADR 004/006/007)
│   ├── explorer/     # File-tree mini-app (VFS browser, rename/delete actions)
│   ├── editor/       # ProseMirror rich-text editor panel
│   ├── codemirror/   # CodeMirror code editor panel
│   ├── settings/     # Settings mini-app: section registry + schema-driven pages
│   ├── sync/         # Sync UI: footer status + settings section (wraps @arxhub/sync)
│   ├── vfs/          # Provides the VirtualFileSystem to other plugins via VfsExtension
│   └── gateway/      # HTTP server plugin (Elysia, Node adapter)
├── toolchains/
│   ├── vite/         # Shared vite.config factories (createGenericConfig, createNodeConfig, createBrowserConfig, createVueConfig, createTauriConfig)
│   ├── tsconfig/     # Shared tsconfig base (strict, esnext, bundler resolution)
│   └── biome/        # Shared Biome config (single quotes, 144 line width, no semicolons)
├── themes/
│   └── default/      # Default theme CSS (Cyan + Slate, imports theme-preset)
├── instances/        # Each instance is self-contained: owns its own plugin registration + config
│   ├── app/          # Tauri desktop app (also builds as a Vite SPA)
│   ├── client/       # Pure SPA build (browser-only, vfs-http backend)
│   ├── dev/          # Combined dev stand — Vite SPA + embedded Elysia server via ssrLoadModule
│   └── server/       # Headless server — Node.js + Gateway + vfs-http (Elysia)
└── docs/
    ├── adr/          # Architecture Decision Records (001–007)
    └── concepts/     # Architecture narratives (plugin-system.md)
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Plugin lifecycle (create/configure/start/stop) | `packages/core/src/plugin.ts` |
| Extension registry | `packages/core/src/extension.ts` |
| Adding an HTTP route | `plugins/gateway/src/server/` |
| VFS interface contract | `packages/vfs/src/virtual-file-system.ts` |
| Node.js VFS impl | `packages/vfs-node/src/node-file-system.ts` |
| Sync engine entrypoint | `packages/sync/src/engine.ts` |
| Snapshot/chunk data models | `packages/sync/src/types/` |
| Error base classes | `packages/errors/src/core.ts` (`AppError`); HTTP factories in `packages/errors/src/http.ts` |
| Generic collections | `packages/stdlib/src/collections/` |
| Vite config factories | `toolchains/vite/src/` (`createVueConfig`, `createNodeConfig`, `createBrowserConfig`, `createTauriConfig`, `createGenericConfig`) |
| Design tokens (CSS vars) | `packages/theme-preset/src/` |
| UI primitives (`@arxhub/uikit/core`) | `packages/uikit/src/core/` |
| Desktop layout shell | `plugins/shell/src/ui/desktop/` |
| UI hooks (`@arxhub/uikit/hooks`) | `packages/uikit/src/hooks/` |
| App instance entry | `instances/app/src/main.ts` |
| Tauri config (src-tauri/) | `instances/app/src-tauri/` |
| Server instance entry | `instances/server/src/main.ts` |
| Architecture decisions | `docs/adr/`, `docs/concepts/plugin-system.md` |

## ARCHITECTURE

Plugin-based hexagonal architecture. Plugins register Extensions during `create()`, then interact with other plugins' extensions during `configure()`. See `docs/concepts/plugin-system.md`.

**Lifecycle order**: `create` → `configure` → `start` → `stop`

**Key invariant**: Extensions are the _only_ inter-plugin communication channel. Plugins never import each other directly.

## UIKIT ENTRY POINTS

`@arxhub/uikit` has no root export — always import from a sub-path:
- `@arxhub/uikit/core` — UI primitives (Button, Input, Switch, …) + layout blocks (Card, NavItem)
- `@arxhub/uikit/hooks` — composables (useMediaQuery, toaster)

## CONVENTIONS

- **Formatter/Linter**: Biome (NOT ESLint/Prettier). `biome check --write` to fix.
- **Style**: single quotes, no semicolons, trailing commas, 144 char line width.
- **Imports**: `@arxhub/*` workspace references; absolute paths via tsconfig `moduleResolution: bundler`.
- **Errors**: All errors extend `AppError` from `@arxhub/errors`. Set `httpStatusCode`. HTTP error factories live in `@arxhub/errors` (`packages/errors/src/http.ts`).
- **Collections**: Use `Container`, `NamedContainer` from `@arxhub/stdlib/collections`. The DI container (`LazyContainer`, `Key`, `createKey`, `isConstructor`) lives in its own package `@arxhub/di`.
- **Tests**: `*.test.ts` always in a `src/__tests__/` folder within the package (never co-located next to source). Imports reach into source one level up (`../foo`). Vitest only; discovery is scoped to `src/**/*.test.ts` via `toolchains/vite/src/generic.ts`.
- **Build**: Each package builds individually with `tsc && vite build`. No root build.
- **Test run**: `pnpm --filter @arxhub/sync test` (per-package). No root test runner configured.
- **biome-ignore format**: Hand-format overloaded method signatures only (established pattern in core/).

## ANTI-PATTERNS (THIS PROJECT)

- **Do NOT** use `as any` or `@ts-ignore` — strict mode is enforced.
- **Do NOT** import packages from their `dist/` — always import from `src/index.ts` within monorepo.
- **Do NOT** bypass encryption or hardcode keys in sync-related code.
- **Do NOT** add direct plugin-to-plugin imports — use extensions.
- **Do NOT** add coverage tooling (`@vitest/coverage-*`) — not configured.
- **Do NOT** commit to `.github/workflows/` — no CI exists yet, don't create it unless asked.
- Avoid `biome-ignore lint/...` unless there is no clean alternative; document reason inline.

## COMMANDS

```bash
# Install
pnpm install

# Build a package
pnpm --filter @arxhub/core build
pnpm --filter @arxhub/uikit build

# Run the dev stand (Vite SPA + embedded Elysia server) — this is the one you usually run
pnpm --filter @arxhub/dev dev

# Run the Tauri desktop app (frontend dev server)
pnpm --filter app dev
# Tauri native window / packaging (wraps the Tauri CLI)
pnpm --filter app tauri dev
pnpm --filter app build      # SPA build (vue-tsc --noEmit && vite build)

# Headless server
pnpm --filter @arxhub/server dev    # dev (vite, embedded)
pnpm --filter @arxhub/server build  # tsc && vite build → dist/main.js
pnpm --filter @arxhub/server start  # node dist/main.js

# Pure SPA build
pnpm --filter @arxhub/client build

# Test
pnpm --filter @arxhub/sync test
pnpm --filter @arxhub/stdlib test

# Lint / format
pnpm biome check --write .

# Add dependency (use catalog when possible)
pnpm --filter @arxhub/sync add some-pkg
```

## CATALOG VERSIONS

Shared dependency versions are pinned in `pnpm-workspace.yaml` under `catalogs:`. Reference via `catalog:client`, `catalog:server`, `catalog:shared`, `catalog:toolchain`, `catalog:tauri`. Don't pin versions manually in package.json when a catalog entry exists. The table below is a convenience snapshot — `pnpm-workspace.yaml` is the source of truth; verify there before relying on a version.

| Catalog | Key Packages |
|---------|--------------|
| client | vue@^3.5, @ark-ui/vue@^5.36 (installed 5.x — see cerebrum), @radix-ui/colors@^3.0, codemirror@^6, prosemirror-*@^1, @atlaskit/pragmatic-drag-and-drop@^1.4 |
| server | elysia@^1.4, @elysiajs/node@^1.2, esbuild@^0.25 |
| shared | @signaldb/core@^1.6, rabin-rs@^2.1, @sinclair/typebox@^0.34, smol-toml@^1.3, async-lock@^1.4, nanoid@^5.1, fflate@^0.8 |
| toolchain | typescript@^6.0, vite@^8.0, @biomejs/biome@^2.4, vitest@^4.1 |
| tauri | @tauri-apps/api@^2.11, @tauri-apps/cli@^2.11, @tauri-apps/plugin-fs@^2.5 |

## NOTES

- There are **four** self-contained instances, each owning its own plugin registration in `src/main.ts` (no shared abstraction — they intentionally drift, so check the one you run): `app` (Tauri desktop, also a SPA build), `client` (pure browser SPA, vfs-http backend), `dev` (combined dev stand — Vite SPA + embedded Elysia via `server.ssrLoadModule`, the one you usually run), `server` (headless Elysia gateway). `dev` uses Vite on :3000 and Elysia on :3001.
- `packages/crypto` and `packages/path` are thin shims over `crypto-browserify`/`path-browserify` with dual `node`/`browser`/`default` export conditions (a `browser` condition is required — Vite 8 does not fall through to `default`).
- `useDefineForClassFields: false` in tsconfig — required for the Plugin/Extension class pattern to work correctly.
- The `biome-ignore format: Hand formatting` pattern in `core/` is intentional for method overload readability — keep it when adding new overloads.
- `toolchains/vite/src/node.ts` has a `biome-ignore lint/style/noParameterAssign` — known workaround for default arg rewrite; do not replicate.

## DESIGN CONTEXT

Strategic design intent lives in [`PRODUCT.md`](PRODUCT.md) (root). Visual system lives in `DESIGN.md` (root, when present) + `.impeccable/design.json`.

- **Register:** product (UI serves the tool; no marketing surfaces).
- **Users:** Obsidian-style local-first knowledge workers + plugin authors; keyboard-driven; mobile is a planned future target.
- **Personality:** *Linear-crisp* — precise, fast, unobtrusive. The tool recedes, content leads.
- **Anti-references:** not generic SaaS, not heavy/enterprise, not toy/cute, not trendy AI-app.
- **A11y commitment:** full keyboard navigation (every action reachable without a mouse).
- Read `PRODUCT.md` before any UI/design work; run impeccable commands (`/impeccable critique|polish|live …`) for design tasks.
