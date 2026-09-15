import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/ui.ts'],
    external: [
      '@arxhub/config',
      '@arxhub/core',
      '@arxhub/errors',
      '@arxhub/path',
      '@arxhub/plugin-notes',
      '@arxhub/plugin-protection',
      '@arxhub/plugin-settings',
      '@arxhub/sync',
      '@arxhub/vfs',
      'vue',
    ],
  }),
)
