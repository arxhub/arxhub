import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

// createVueConfig even though the first cut ships no SFC: createBrowserConfig takes neither `entries`
// nor `external`, so the library build with `src/ui.ts` as its entry and vue left external cannot be
// expressed with it. The vue plugin costs nothing while there is no SFC, and the shortcut sheet
// (A-37) will need it.
export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/ui.ts'],
    external: ['@arxhub/core', '@arxhub/events', 'vue'],
  }),
)
