import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/ui.ts'],
    external: [
      '@arxhub/config',
      '@arxhub/core',
      '@arxhub/errors',
      '@arxhub/crypto',
      '@arxhub/plugin-protection',
      '@arxhub/plugin-settings',
      '@arxhub/plugin-shell',
      '@arxhub/plugin-vfs',
      '@arxhub/sync',
      '@arxhub/uikit',
      '@arxhub/vfs',
      'vue',
    ],
  }),
)
