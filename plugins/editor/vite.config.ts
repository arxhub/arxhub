import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/ui.ts'],
    external: [
      '@arxhub/core',
      '@arxhub/path',
      '@arxhub/plugin-explorer',
      '@arxhub/plugin-panels',
      '@arxhub/uikit',
      '@arxhub/vfs',
      'prosemirror-model',
      'prosemirror-state',
      'prosemirror-view',
      'prosemirror-commands',
      'prosemirror-history',
      'prosemirror-inputrules',
      'prosemirror-keymap',
      'prosemirror-schema-basic',
      'prosemirror-schema-list',
      'mdast-util-from-markdown',
      'mdast-util-gfm',
      'micromark-extension-gfm',
      'vue',
    ],
  }),
)
