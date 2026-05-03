import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/manifest.ts', 'src/ui.ts'],
    external: ['@arxhub/core', '@arxhub/uikit', 'vue'],
  }),
)
