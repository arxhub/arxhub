import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/manifest.ts', 'src/ui.ts', 'src/ui-desktop.ts', 'src/ui-mobile.ts'],
    external: [
      '@arxhub/core',
      '@arxhub/plugin-hotkeys',
      '@arxhub/plugin-hotkeys/ui',
      '@arxhub/uikit',
      '@arxhub/uikit/core',
      '@arxhub/uikit/hooks',
      'vue',
    ],
  }),
)
