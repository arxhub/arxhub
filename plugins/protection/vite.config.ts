import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/manifest.ts', 'src/server.ts', 'src/ui.ts'],
    external: [
      '@arxhub/core',
      '@arxhub/crypto',
      '@arxhub/errors',
      '@arxhub/http',
      '@sinclair/typebox',
      '@arxhub/plugin-gateway/server',
      '@arxhub/plugin-keystore',
      '@arxhub/plugin-keystore/ui',
      '@arxhub/plugin-settings',
      '@arxhub/plugin-shell/ui',
      '@arxhub/stdlib/format/bytes',
      '@arxhub/sync',
      '@arxhub/uikit',
      '@arxhub/uikit/core',
      '@arxhub/uikit/hooks',
      '@arxhub/vfs',
      'elysia',
      'vue',
      '@arxhub/plugin-shell',
      '@arxhub/plugin-gateway',
    ],
  }),
)
