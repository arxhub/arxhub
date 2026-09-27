import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/manifest.ts', 'src/ui.ts'],
    external: [
      '@arxhub/core',
      '@arxhub/errors',
      '@arxhub/i18n',
      '@arxhub/path',
      '@arxhub/plugin-documents',
      '@arxhub/plugin-documents/ui',
      '@arxhub/plugin-panels',
      '@arxhub/plugin-panels/ui',
      '@arxhub/plugin-search',
      '@arxhub/plugin-vfs',
      '@arxhub/uikit',
      '@arxhub/vfs',
      'pdfjs-dist',
      'pdfjs-dist/legacy/build/pdf.mjs',
      'vue',
    ],
  }),
)
