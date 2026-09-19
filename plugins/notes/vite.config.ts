import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/ui.ts', 'src/manifest.ts', 'src/notes-type.ts'],
    external: [
      '@arxhub/config',
      '@arxhub/core',
      '@arxhub/errors',
      '@arxhub/path',
      '@arxhub/plugin-repository',
      '@arxhub/plugin-settings',
      '@arxhub/plugin-shell',
      '@arxhub/plugin-shell/ui',
      '@arxhub/uikit',
      '@arxhub/uikit/core',
      '@arxhub/uikit/hooks',
      '@arxhub/vfs',
      'vue',
    ],
  }),
)
