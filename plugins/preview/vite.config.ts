import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/manifest.ts', 'src/ui.ts'],
    external: [
      '@arxhub/core',
      '@arxhub/path',
      '@arxhub/plugin-notes',
      '@arxhub/plugin-notes/ui',
      '@arxhub/plugin-panels',
      '@arxhub/plugin-panels/ui',
      '@arxhub/uikit',
      '@arxhub/vfs',
      'pdfjs-dist',
      'pdfjs-dist/legacy/build/pdf.mjs',
      'vue',
    ],
  }),
)
