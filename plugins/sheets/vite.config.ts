import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/ui.ts'],
    external: [
      '@arxhub/core',
      '@arxhub/errors',
      '@arxhub/plugin-explorer/ui',
      '@arxhub/plugin-editor/ui',
      '@arxhub/plugin-hotkeys/ui',
      '@arxhub/plugin-notes/ui',
      '@arxhub/plugin-panels/ui',
      '@arxhub/plugin-repository/ui',
      '@arxhub/plugin-shell/ui',
      '@arxhub/stdlib/scheduling/debounced-task',
      '@arxhub/uikit/core',
      '@arxhub/uikit/hooks',
      '@arxhub/vfs',
    ],
  }),
)
