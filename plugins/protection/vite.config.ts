import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/manifest.ts', 'src/server.ts'],
    external: [
      '@arxhub/core',
      '@arxhub/crypto',
      '@arxhub/plugin-gateway/server',
      '@arxhub/plugin-keystore',
      '@arxhub/plugin-keystore/ui',
      '@arxhub/plugin-settings',
      '@arxhub/plugin-shell/ui',
      '@arxhub/uikit',
      '@arxhub/vfs',
      'elysia',
      'vue',
      '@arxhub/plugin-shell',
      '@arxhub/plugin-gateway',
    ],
  }),
)
