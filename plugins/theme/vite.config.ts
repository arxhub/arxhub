import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/manifest.ts'],
    external: ['@arxhub/core', '@arxhub/config', '@arxhub/plugin-settings', '@arxhub/uikit', 'vue'],
  }),
)
