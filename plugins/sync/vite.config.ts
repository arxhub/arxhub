import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/manifest.ts', 'src/server.ts'],
    external: [
      '@arxhub/config',
      '@arxhub/core',
      '@arxhub/errors',
      '@arxhub/crypto',
      '@arxhub/plugin-gateway/server',
      '@arxhub/plugin-protection',
      '@arxhub/plugin-repository',
      '@arxhub/plugin-settings',
      '@arxhub/plugin-shell',
      '@arxhub/plugin-shell/ui',
      '@arxhub/sync',
      '@arxhub/sync/server',
      '@arxhub/uikit',
      '@arxhub/vfs',
      'vue',
      '@arxhub/plugin-gateway',
    ],
  }),
)
