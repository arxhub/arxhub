import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/manifest.ts', 'src/ui.ts'],
    external: ['@arxhub/core', '@arxhub/plugin-settings', '@arxhub/plugin-shell', '@arxhub/plugin-shell/ui', '@arxhub/uikit', 'vue'],
  }),
)
