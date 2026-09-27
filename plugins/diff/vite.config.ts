import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/ui.ts', 'src/manifest.ts'],
    external: [
      '@arxhub/config',
      '@arxhub/core',
      '@arxhub/errors',
      '@arxhub/i18n',
      '@arxhub/logger',
      '@arxhub/plugin-hotkeys',
      '@arxhub/plugin-hotkeys/ui',
      '@arxhub/plugin-settings',
      '@arxhub/uikit',
      '@arxhub/uikit/core',
      '@arxhub/uikit/hooks',
      '@sinclair/typebox',
      'vue',
    ],
  }),
)
