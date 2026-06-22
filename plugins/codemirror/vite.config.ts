import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/ui.ts'],
    external: [
      '@arxhub/core',
      '@arxhub/plugin-panels',
      '@arxhub/uikit',
      '@arxhub/vfs',
      'codemirror',
      '@codemirror/language',
      '@codemirror/language-data',
      '@codemirror/state',
      'vue',
    ],
  }),
)
