# @arxhub/toolchain-vite

Shared Vite config factories for ArxHub packages and instances.

## Factories

| Export | Use |
|--------|-----|
| `createGenericConfig` | Vitest discovery, tsconfig paths, optional dts in production builds |
| `createNodeConfig` | Node libraries — external deps from the workspace `package.json` walk |
| `createBrowserConfig` | Browser libraries on top of generic |
| `createVueConfig` | Vue SFC libraries (default) or SPA when `{ lib: false }` |
| `createTauriConfig` | Tauri frontend — `createVueConfig` + fixed dev server / `TAURI_` env prefix |

Import from `@arxhub/toolchain-vite` or subpaths re-exported by the package entry.

## Usage

```bash
pnpm add -D @arxhub/toolchain-vite
```

```typescript
import { defineConfig } from 'vite'
import { createNodeConfig } from '@arxhub/toolchain-vite'

export default defineConfig((env) => createNodeConfig(__dirname, env))
```
