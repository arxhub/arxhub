import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/ui.ts'],
    external: ['@arxhub/core', '@arxhub/uikit', '@arxhub/plugin-shell', '@arxhub/plugin-vfs', '@arxhub/vfs', '@arxhub/config', 'vue'],
  }),
)
