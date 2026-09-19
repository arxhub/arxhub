import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/manifest.ts', 'src/ui.ts'],
    external: [
      '@arxhub/config',
      '@arxhub/config/ui',
      '@arxhub/core',
      '@arxhub/errors',
      '@arxhub/logger',
      '@arxhub/plugin-codemirror',
      '@arxhub/plugin-codemirror/ui',
      '@arxhub/plugin-explorer',
      '@arxhub/plugin-explorer/ui',
      '@arxhub/plugin-notes',
      '@arxhub/plugin-notes/ui',
      '@arxhub/plugin-panels',
      '@arxhub/plugin-panels/ui',
      '@arxhub/plugin-settings',
      '@arxhub/plugin-shell',
      '@arxhub/plugin-shell/ui',
      '@arxhub/sql',
      '@arxhub/uikit',
      '@arxhub/uikit/core',
      '@arxhub/uikit/hooks',
      '@arxhub/vfs',
      'vue',
    ],
  }),
)
