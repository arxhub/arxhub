import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/manifest.ts'],
    external: [
      '@arxhub/core',
      '@arxhub/uikit',
      '@arxhub/plugin-hotkeys',
      '@arxhub/plugin-hotkeys/ui',
      '@arxhub/plugin-shell',
      '@arxhub/plugin-shell/ui',
      '@arxhub/plugin-vfs',
      '@arxhub/vfs',
      '@arxhub/config',
      'vue',
    ],
  }),
)
