import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/manifest.ts'],
    external: [
      '@arxhub/core',
      '@arxhub/errors',
      '@arxhub/plugin-explorer/ui',
      '@arxhub/plugin-explorer',
      '@arxhub/plugin-editor/ui',
      '@arxhub/plugin-editor',
      '@arxhub/plugin-hotkeys',
      '@arxhub/plugin-hotkeys/ui',
      '@arxhub/plugin-notes',
      '@arxhub/plugin-notes/ui',
      '@arxhub/plugin-panels',
      '@arxhub/plugin-panels/ui',
      '@arxhub/plugin-repository',
      '@arxhub/plugin-shell',
      '@arxhub/plugin-shell/ui',
      '@arxhub/stdlib/scheduling/debounced-task',
      '@arxhub/uikit/core',
      '@arxhub/uikit/hooks',
      '@arxhub/vfs',
    ],
  }),
)
