import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/ui.ts'],
    external: [
      '@arxhub/core',
      '@arxhub/vfs',
      '@arxhub/uikit',
      '@arxhub/plugin-notes',
      '@arxhub/plugin-panels',
      '@arxhub/plugin-repository',
      '@arxhub/plugin-shell',
      'vue',
    ],
  }),
)
