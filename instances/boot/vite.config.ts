import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

// Two entries, like every other package with both halves (see plugins/publish): this is a library the
// four instances call, not an app of its own.
export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/client.ts', 'src/server.ts'],
    external: [
      '@arxhub/core',
      '@arxhub/crypto',
      '@arxhub/errors',
      '@arxhub/plugin-keystore/ui',
      '@arxhub/plugin-maintenance/ui',
      '@arxhub/plugin-notes/ui',
      '@arxhub/plugin-panels/ui',
      '@arxhub/plugin-protection/ui',
      '@arxhub/plugin-shell/ui',
      '@arxhub/plugin-shell/ui-desktop',
      '@arxhub/plugin-shell/ui-mobile',
      '@arxhub/uikit/hooks',
      '@arxhub/vfs',
      '@arxhub/vfs-node',
      '@sinclair/typebox',
      'vue',
    ],
  }),
)
