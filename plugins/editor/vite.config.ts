import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/ui.ts'],
    external: [
      '@arxhub/core',
      '@arxhub/plugin-panels',
      '@arxhub/plugin-vfs',
      '@arxhub/uikit',
      'prosemirror-model',
      'prosemirror-state',
      'prosemirror-view',
      'prosemirror-commands',
      'prosemirror-history',
      'prosemirror-inputrules',
      'prosemirror-keymap',
      'prosemirror-schema-basic',
      'prosemirror-schema-list',
      'vue',
    ],
  }),
)
