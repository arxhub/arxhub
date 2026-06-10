# ArxHub

> A modular, offline-first personal knowledge management system.

ArxHub is a local-first knowledge hub built as a **plugin platform**. A small core
orchestrates a lifecycle of independent plugins, talking to each other only through
typed extensions — so editors, file explorers, sync backends and UI panels can be
added, swapped or disabled without touching the rest of the system. It runs the same
codebase as a **Tauri desktop app**, a **web SPA**, and a **headless Node server**.

- **Local-first & offline** — files live in a Virtual File System; an encrypted sync
  engine (Rabin content-defined chunking + snapshots) reconciles changes when online.
- **Plugin/extension architecture** — every feature is a plugin; plugins never import
  each other, they communicate through registered extensions.
- **One codebase, many targets** — desktop (Tauri 2.x), browser SPA, and server.
- **Vue 3 UI** — a VSCode-style shell with draggable panels/tabs, a file explorer,
  a ProseMirror + CodeMirror editor, and a Radix Colors design system.

---

## Architecture

ArxHub uses a plugin-based hexagonal architecture. The **Core** ([`@arxhub/core`](packages/core/))
owns nothing but the plugin lifecycle and the extension registry; all real features
are plugins.

**Lifecycle:** `create → configure → start → stop`

1. **create** — a plugin initializes and registers the extensions it provides.
2. **configure** — plugins look up *other* plugins' extensions and wire themselves in
   (e.g. add an HTTP route, contribute a settings section, mount a UI panel).
3. **start** — long-running work begins (HTTP server, sync loop, …).
4. **stop** — graceful shutdown and cleanup.

> **Key invariant:** Extensions are the *only* inter-plugin communication channel.
> Plugins are never allowed to import one another directly.

See [docs/concepts/plugin-system.md](docs/concepts/plugin-system.md) for the full
narrative, [docs/guide/creating-a-plugin.md](docs/guide/creating-a-plugin.md) to build
your own, and [docs/adr/](docs/adr/) for the architecture decision records (VFS design,
panels, event bus, drag-and-drop, …).

## Monorepo layout

A pnpm + TypeScript workspace. Packages build individually with `tsc && vite build`
(there is no root build).

```
arxhub/
├── packages/          # Publishable libraries
│   ├── core/          # Plugin/extension lifecycle orchestrator — start here
│   ├── stdlib/        # Cross-cutting utilities (collections, fs, record, crypto)
│   ├── errors/        # AppError base + HTTP error schemas
│   ├── events/        # Typed global EventBus
│   ├── http/          # Thin HTTP client wrapper
│   ├── config/        # TOML-backed config read/write + ConfigForm UI
│   ├── vfs/           # Virtual File System contract + generic implementation
│   ├── vfs-node/      # Node.js VFS backend
│   ├── vfs-tauri/     # Tauri (native filesystem) VFS backend
│   ├── vfs-http/      # HTTP VFS client + server (serve any VFS over HTTP)
│   ├── sync/          # Offline-first sync engine (Rabin chunking + snapshots)
│   ├── uikit/         # Vue 3 UI library — @arxhub/uikit/core, /hooks
│   ├── theme-preset/  # Radix Colors CSS variables + design tokens
│   ├── crypto/        # Browser crypto shim
│   └── path/          # Browser path shim
├── plugins/           # Feature plugins
│   ├── shell/         # Desktop layout shell (header, sidebar, footer, mini-app shell)
│   ├── panels/        # VSCode-style draggable panels & tabs
│   ├── explorer/      # File tree explorer with hand-rolled action menus
│   ├── editor/        # ProseMirror rich-text editor
│   ├── codemirror/    # CodeMirror code editor
│   ├── settings/      # Settings registry (VSCode/Obsidian-style sections)
│   ├── sync/          # Sync status UI (footer)
│   ├── vfs/           # Wires a VFS backend into the plugin system
│   └── gateway/       # Elysia HTTP server plugin
├── instances/         # Runnable apps (each registers its own plugins)
│   ├── app/           # Tauri desktop app + web SPA
│   ├── server/        # Headless Node.js API server
│   ├── client/        # Pure static SPA build
│   └── dev/           # Combined dev stand: Vite HMR + Elysia in one process
├── toolchains/        # Shared build config: vite/, tsconfig/, biome/
├── themes/default/    # Default theme (Cyan + Slate)
└── docs/              # adr/, concepts/, guide/
```

## Getting started

**Prerequisites:** [pnpm](https://pnpm.io/), a recent Node.js (the workspace targets
`@types/node` 25.x), and — for the desktop build — the
[Tauri 2.x prerequisites](https://tauri.app/start/prerequisites/) (Rust toolchain).

```bash
# Install all workspace dependencies
pnpm install

# Run the combined dev stand (Vite SPA on :3000, Elysia API on :3001 with HMR)
pnpm --filter @arxhub/dev dev
```

`instances/dev` is the recommended day-to-day development entry point: it boots the
full plugin set with hot-reload and proxies API routes (`/vfs`, `/healthcheck`) to the
embedded Elysia server.

### Running each target

```bash
# Desktop app (Tauri)
pnpm --filter app tauri dev

# Desktop app — web SPA dev server
pnpm --filter app dev

# Headless server (Vite-driven dev)
pnpm --filter @arxhub/server dev
```

### Building

```bash
# Build any package / plugin
pnpm --filter @arxhub/core build
pnpm --filter @arxhub/uikit build

# Build the targets
pnpm --filter app build          # web SPA bundle
pnpm --filter app tauri build    # desktop binary
pnpm --filter @arxhub/client build
pnpm --filter @arxhub/server build && pnpm --filter @arxhub/server start
```

### Testing, linting & formatting

Tests run per-package with [Vitest](https://vitest.dev/) (there is no root test runner).

```bash
# Run a package's tests
pnpm --filter @arxhub/sync test
pnpm --filter @arxhub/stdlib test
pnpm --filter @arxhub/vfs-node test

# Lint & format (Biome — not ESLint/Prettier)
pnpm biome check --write .
```

## Conventions

- **Formatter/linter:** [Biome](https://biomejs.dev/) — single quotes, no semicolons,
  trailing commas, 144-char line width. Run `biome check --write` to fix.
- **Imports:** workspace packages via `@arxhub/*`; never import from a package's
  `dist/` inside the monorepo — always from its `src`.
- **Errors:** extend `AppError` from [`@arxhub/errors`](packages/errors/) and set an
  `httpStatusCode`.
- **Strict TypeScript:** no `as any` / `@ts-ignore`.
- **UIKit:** no root export — import from `@arxhub/uikit/core` (primitives) or
  `@arxhub/uikit/hooks` (composables).
- **Colors:** use the Radix palette CSS variables (`var(--gray-N)`, `var(--accent-N)`,
  …) from `@arxhub/theme-preset`; never hardcode hex/rgb.
- **Dependency versions** are pinned in [pnpm-workspace.yaml](pnpm-workspace.yaml)
  catalogs (`catalog:client`, `catalog:server`, `catalog:shared`, `catalog:toolchain`,
  `catalog:tauri`) — reference the catalog instead of pinning manually.

## Tech stack

| Area | Tooling |
|------|---------|
| Language / monorepo | TypeScript, pnpm workspaces, Vite (single dev runner) |
| UI | Vue 3, Ark UI (leaf primitives), Radix Colors, lucide icons |
| Editor | ProseMirror (rich text), CodeMirror 6 (code) |
| Drag & drop | `@atlaskit/pragmatic-drag-and-drop` |
| Server | Elysia (Node adapter) |
| Sync | Rabin content-defined chunking (`rabin-rs`), SignalDB, fflate |
| Desktop | Tauri 2.x |
| Test / lint | Vitest, Biome |

## License

AGPL-3.0-or-later
