import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/manifest.ts', 'src/ui.ts', 'src/server.ts'],
    external: [
      '@arxhub/core',
      '@arxhub/config',
      '@arxhub/crypto',
      '@arxhub/errors',
      '@arxhub/http',
      '@arxhub/plugin-gateway',
      '@arxhub/plugin-protection',
      '@arxhub/plugin-repository',
      '@arxhub/plugin-settings',
      '@arxhub/plugin-shell',
      '@arxhub/uikit/core',
      '@arxhub/uikit/hooks',
      '@arxhub/vfs',
      'vue',
      'elysia',
      'saxes',
      '@sinclair/typebox',
    ],
  }),
)
