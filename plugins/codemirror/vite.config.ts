import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/manifest.ts', 'src/ui.ts'],
    external: [
      '@arxhub/i18n',
      '@arxhub/core',
      '@arxhub/plugin-hotkeys',
      '@arxhub/plugin-hotkeys/ui',
      '@arxhub/plugin-documents',
      '@arxhub/plugin-documents/ui',
      '@arxhub/plugin-panels',
      '@arxhub/plugin-panels/ui',
      '@arxhub/uikit',
      '@arxhub/vfs',
      'codemirror',
      '@codemirror/language',
      '@codemirror/language-data',
      '@codemirror/state',
      '@codemirror/commands',
      '@codemirror/search',
      'vue',
      '@arxhub/plugin-shell/ui',
    ],
  }),
)
