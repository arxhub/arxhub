import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/ui.ts', 'src/server.ts'],
    external: [
      '@arxhub/core',
      '@arxhub/crypto',
      '@arxhub/plugin-keystore',
      '@arxhub/plugin-settings',
      '@arxhub/uikit',
      '@arxhub/vfs',
      'elysia',
      'vue',
    ],
  }),
)
