import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

// The root entry is the plugin wire-up and contract; only `ui.ts` owns Vue composables. Keeping every
// public entry in the build makes the source and publish export maps agree.
export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/manifest.ts', 'src/ui.ts'],
    external: ['@arxhub/core', '@arxhub/events', 'vue'],
  }),
)
