# toolchains/

Internal build toolchain packages. Published as workspace packages (`@arxhub/toolchain-*`). Extended by all packages — do not configure build/lint/ts directly in leaf packages.

## PACKAGES

### toolchains/tsconfig
Base `tsconfig.json`. Key non-defaults:
- `"target": "esnext"`, `"module": "esnext"`, `"moduleResolution": "bundler"`
- `"strict": true`, `"noImplicitOverride": true`
- `"useDefineForClassFields": false` — **required** for Plugin/Extension class field semantics
- `"isolatedModules": true`, `"skipLibCheck": true`

All packages extend with `"extends": "@arxhub/toolchain-tsconfig"`.

### toolchains/biome
Base `biome.json`. Key settings:
- Formatter: `indentStyle: space`, `indentWidth: 2`
- JS: `quoteStyle: single`, `semicolons: asNeeded`, `trailingCommas: all`, `lineWidth: 144`
- Linter: recommended rules enabled; `noChildrenProp: off`
- Assists: `organizeImports: on`
- CSS modules enabled

All packages extend with `"extends": ["@arxhub/toolchain-biome"]`.

### toolchains/vite
Five config factory functions in `src/`:
- `createGenericConfig(dirname, env)` — base: outDir=dist, esnext target, Vitest config (watch:false, `src/**/*.test.ts?(x)`)
- `createNodeConfig(dirname, env, entries?)` — Node library: ES format, preserveModules, nodeExternals, treeshake:false
- `createBrowserConfig(dirname, env)` — Browser bundle (same as generic, no lib output)
- `createVueConfig(dirname, env, options?)` — Vue library or SPA: adds `@vitejs/plugin-vue`, optional lib mode
- `createTauriConfig(dirname, env)` — Tauri app: wraps `createVueConfig({lib:false})` + port 1420, `clearScreen:false`, `TAURI_` env prefix

#### createVueConfig options

```ts
interface VueConfigOptions {
  lib?: boolean       // false for SPA (no lib output). Default: true
  external?: string[] // extra packages to mark external (vue always external)
  entries?: string[]  // multiple entry points. Default: ['src/index.ts']
}
```

#### Usage examples

```ts
// Vue component library (single entry)
export default defineConfig((env) => createVueConfig(__dirname, env))

// Vue library with multiple entry points
export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/desktop/index.ts', 'src/mobile/index.ts'],
  }),
)

// SPA (no lib output)
export default defineConfig((env) => createVueConfig(__dirname, env, { lib: false }))

// Node library
export default defineConfig((env) => createNodeConfig(__dirname, env))

// Tauri app (desktop + mobile)
export default defineConfig((env) => createTauriConfig(__dirname, env))
```

## ANTI-PATTERNS

- Do NOT override `lineWidth`, `quoteStyle`, or `indentStyle` in leaf package `biome.json`.
- Do NOT set `useDefineForClassFields: true` — breaks Plugin/Extension constructor semantics.
- Do NOT add non-external deps inside `createNodeConfig` — `nodeExternalsPlugin` externalizes everything including devDeps.
- Do NOT use `createNodeConfig` for Vue packages — use `createVueConfig` instead.
- Do NOT use `createVueConfig` for Tauri apps — use `createTauriConfig` (required port/env settings).
