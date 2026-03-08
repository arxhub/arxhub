# instances/app

Single runnable ArxHub application. Vue 3 SPA with responsive layout switching (desktop ↔ mobile at 768px). Packaged as Tauri native app (desktop + mobile) or Vite SPA (web).

## STRUCTURE

```
src/
├── main.ts       # Entry: boots ArxHub, imports theme, mounts Vue
├── App.vue       # Root: useMediaQuery(768px) → DesktopLayout | MobileLayout
├── components/   # App-specific components (none yet)
└── assets/       # Static assets

src-tauri/        # Tauri v2 configuration
├── Cargo.toml
├── tauri.conf.json
├── src/
│   └── lib.rs    # Rust entry (minimal — just runs JS)
├── icons/        # App icons
└── gen/          # Auto-generated mobile configs

vite.config.ts    # Uses createTauriConfig from @arxhub/toolchain-vite
index.html
package.json      # Private, depends on core + uikit + theme
```

## LAYOUT SWITCHING

App.vue uses `@arxhub/uikit/hooks/useMediaQuery` for responsive detection:

```vue
<script setup>
const isMobile = useMediaQuery('(max-width: 768px)')
</script>
<template>
  <MobileLayout v-if="isMobile" />
  <DesktopLayout v-else />
</template>
```

## DEVELOPMENT

```bash
# Web browser (fastest dev loop)
pnpm --filter @arxhub/app dev:web

# Desktop (Tauri)
pnpm --filter @arxhub/app dev

# Mobile builds
pnpm --filter @arxhub/app build:android
pnpm --filter @arxhub/app build:ios
```

## BOOT SEQUENCE

1. Import theme-preset + theme (CSS side-effects)
2. `new ArxHub()` — instantiate core
3. `await arxhub.start()` — lifecycle: create → configure → start
4. `createApp(App).mount('#app')` — Vue takeover

## CONVENTIONS

- App is a thin shell — business logic lives in plugins.
- Layout components from `@arxhub/uikit/desktop` and `@arxhub/uikit/mobile`.
- No router yet — simple conditional rendering based on viewport.
- Tauri Rust code is minimal; all logic in TypeScript.

## ANTI-PATTERNS

- Do NOT add business logic here — extend via plugins.
- Do NOT import from `dist/` of workspace packages — always `src/`.
- Do NOT hardcode layout breakpoints — use `useMediaQuery` with token values.
- Do NOT commit `src-tauri/target/` or mobile build artifacts.

## ENVIRONMENT VARIABLES

- `WEBKIT_DISABLE_COMPOSITING_MODE=1` — set in `dev` script for Tauri/GTK compatibility on Linux.
