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
Three config factory functions in `src/`:
- `createGenericConfig(dirname, env)` — base: outDir=dist, esnext target, Vitest config (watch:false, `src/**/*.test.ts?(x)`)
- `createNodeConfig(dirname, env, entries?)` — Node library: ES format, preserveModules, nodeExternals, treeshake:false
- `createBrowserConfig(dirname, env)` — Browser bundle (currently same as generic)

Usage in package:
```ts
// vite.config.ts
import { createNodeConfig } from '@arxhub/toolchain-vite'
export default defineConfig((env) => createNodeConfig(import.meta.dirname, env))
```

## ANTI-PATTERNS

- Do NOT override `lineWidth`, `quoteStyle`, or `indentStyle` in leaf package `biome.json`.
- Do NOT set `useDefineForClassFields: true` — breaks Plugin/Extension constructor semantics.
- Do NOT add non-external deps inside `createNodeConfig` — `nodeExternalsPlugin` externalizes everything including devDeps.
