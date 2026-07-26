import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/ui.ts'],
    external: [
      '@arxhub/config',
      '@arxhub/core',
      '@arxhub/errors',
      '@arxhub/logger',
      '@arxhub/plugin-codemirror',
      '@arxhub/plugin-panels',
      '@arxhub/plugin-settings',
      '@arxhub/plugin-shell',
      '@arxhub/sql',
      '@arxhub/uikit',
      '@arxhub/vfs',
      'vue',
    ],
  }),
)
