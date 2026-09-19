import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/manifest.ts'],
    external: [
      '@arxhub/config',
      '@arxhub/core',
      '@arxhub/errors',
      '@arxhub/path',
      '@arxhub/plugin-protection',
      '@arxhub/plugin-settings',
      '@arxhub/plugin-vfs',
      '@arxhub/sync',
      '@arxhub/vfs',
      'vue',
    ],
  }),
)
