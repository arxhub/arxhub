# ARXHUB — PROJECT KNOWLEDGE BASE

**Updated:** 2026-03-07
**Branch:** main

## OVERVIEW

ArxHub is a modular personal knowledge management system — a pnpm TypeScript monorepo structured around a plugin/extension lifecycle system (Core), virtual file abstraction (VFS), offline-first sync with Rabin chunking (Sync), and an HTTP gateway (Elysia). UI is Vue 3 + Radix Colors CSS.

## STRUCTURE

```
arxhub/
├── packages/         # Core publishable libraries
│   ├── core/         # Plugin/Extension lifecycle orchestrator — start here
│   ├── stdlib/       # Cross-cutting utilities (errors, collections, fs, crypto)
│   ├── vfs/          # Virtual file system abstraction (interface + GenericFile)
│   ├── vfs-node/     # Node.js VFS implementation
│   ├── sync/         # Offline-first sync engine (Rabin chunking + snapshots)
│   ├── uikit/        # Vue 3 UI library — multi-entry: core / desktop / mobile
│   ├── theme-preset/ # Radix Colors CSS variables (design tokens)
│   ├── crypto/       # Browser crypto shim (crypto-browserify)
│   └── path/         # Browser path shim (path-browserify)
├── plugins/
│   └── gateway/      # HTTP server plugin (Elysia/ElysiaJS, Node adapter)
├── toolchains/
│   ├── vite/         # Shared vite.config factories (createNodeConfig, createBrowserConfig, createVueConfig)
│   ├── tsconfig/     # Shared tsconfig base (strict, esnext, bundler resolution)
│   └── biome/        # Shared Biome config (single quotes, 144 line width, no semicolons)
├── themes/
│   └── default/      # Default theme CSS (Cyan + Slate, imports theme-preset)
├── instances/
│   └── app/          # Single app — web (Vite), desktop + mobile (Tauri 2.x)
└── docs/
    ├── adr/          # Architecture Decision Records
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
| Error base classes | `packages/stdlib/src/errors/app-error.ts` |
| Generic collections | `packages/stdlib/src/collections/` |
| Vite config factories | `toolchains/vite/src/` (`createVueConfig`, `createNodeConfig`, `createTauriConfig`) |
| Design tokens (CSS vars) | `packages/theme-preset/src/` |
| UI primitives (`@arxhub/uikit/core`) | `packages/uikit/src/core/` |
| Desktop layout shell (`@arxhub/uikit/desktop`) | `packages/uikit/src/desktop/` |
| Mobile layout shell (`@arxhub/uikit/mobile`) | `packages/uikit/src/mobile/` |
| UI hooks (`@arxhub/uikit/hooks`) | `packages/uikit/src/hooks/` |
| App instance entry | `instances/app/src/main.ts` |
| Tauri config (src-tauri/) | `instances/app/src-tauri/` |
| Architecture decisions | `docs/adr/`, `docs/concepts/plugin-system.md` |

## ARCHITECTURE

Plugin-based hexagonal architecture. Plugins register Extensions during `create()`, then interact with other plugins' extensions during `configure()`. See `docs/concepts/plugin-system.md`.

**Lifecycle order**: `create` → `configure` → `start` → `stop`

**Key invariant**: Extensions are the _only_ inter-plugin communication channel. Plugins never import each other directly.

## UIKIT ENTRY POINTS

`@arxhub/uikit` has no root export — always import from a sub-path:
- `@arxhub/uikit/core` — UI primitives (Button, Input, Switch, …) + layout blocks (Card, NavItem)
- `@arxhub/uikit/hooks` — composables (useMediaQuery, toaster)
- `@arxhub/uikit/desktop` — DesktopLayout + AppHeader / AppSidebar / AppFooter
- `@arxhub/uikit/mobile` — MobileLayout + MobileHeader / BottomNav

## CONVENTIONS

- **Formatter/Linter**: Biome (NOT ESLint/Prettier). `biome check --write` to fix.
- **Style**: single quotes, no semicolons, trailing commas, 144 char line width.
- **Imports**: `@arxhub/*` workspace references; absolute paths via tsconfig `moduleResolution: bundler`.
- **Errors**: All errors extend `AppError` from `@arxhub/stdlib/errors/app-error`. Set `httpStatusCode`.
- **Collections**: Use `Container`, `LazyContainer`, `NamedContainer` from `@arxhub/stdlib/collections`.
- **Tests**: `*.test.ts` co-located in `src/__tests__/` (sync) or next to source (stdlib). Vitest only.
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

# Run app (web browser)
pnpm --filter @arxhub/app dev:web

# Run app (Tauri desktop)
pnpm --filter @arxhub/app dev

# Build for web / desktop / mobile
pnpm --filter @arxhub/app build:web
pnpm --filter @arxhub/app build
pnpm --filter @arxhub/app build:android
pnpm --filter @arxhub/app build:ios

# Test
pnpm --filter @arxhub/sync test
pnpm --filter @arxhub/stdlib test

# Lint / format
pnpm biome check --write .

# Add dependency (use catalog when possible)
pnpm --filter @arxhub/sync add some-pkg
```

## CATALOG VERSIONS

Shared dependency versions are pinned in `pnpm-workspace.yaml` under `catalogs:`. Reference via `catalog:client`, `catalog:server`, `catalog:shared`, `catalog:toolchain`, `catalog:tauri`. Don't pin versions manually in package.json when a catalog entry exists.

## NOTES

- `instances/app` is the single app instance — runs as a Vite SPA (`dev:web`/`build:web`) or Tauri native app (`dev`/`build`/`build:android`/`build:ios`). Boots ArxHub and renders desktop or mobile layout based on viewport width (768px breakpoint).
- `packages/crypto` and `packages/path` are thin browser shims (pre-compiled JS), not TypeScript.
- `useDefineForClassFields: false` in tsconfig — required for the Plugin/Extension class pattern to work correctly.
- The `biome-ignore format: Hand formatting` pattern in `core/` is intentional for method overload readability — keep it when adding new overloads.
- `toolchains/vite/src/node.ts` has a `biome-ignore lint/style/noParameterAssign` — known workaround for default arg rewrite; do not replicate.
