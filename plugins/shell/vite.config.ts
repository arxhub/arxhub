import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/manifest.ts', 'src/ui.ts', 'src/ui-desktop.ts', 'src/ui-mobile.ts'],
    external: ['@arxhub/core', '@arxhub/plugin-hotkeys', '@arxhub/uikit', 'vue'],
  }),
)
