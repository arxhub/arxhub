import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

// Two entries, like every other plugin with both halves (see plugins/protection): the plugin is a
// library, not an app. It was on createBrowserConfig with no entries, which adds nothing to the
// generic config — so vite fell back to an app build and failed looking for an index.html.
export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/ui.ts', 'src/server.ts'],
    external: [
      '@arxhub/config',
      '@arxhub/core',
      '@arxhub/plugin-notes/ui',
      '@arxhub/plugin-explorer/ui',
      '@arxhub/plugin-protection/ui',
      '@arxhub/plugin-settings/ui',
      '@arxhub/plugin-shell/ui',
      '@arxhub/plugin-gateway/server',
      '@arxhub/sync/server',
      '@arxhub/vfs-http/server',
      '@arxhub/uikit/core',
      '@arxhub/uikit/hooks',
      '@arxhub/errors',
      '@arxhub/plugin-explorer',
      '@arxhub/plugin-gateway',
      '@arxhub/plugin-protection',
      '@arxhub/plugin-settings',
      '@arxhub/plugin-shell',
      '@arxhub/plugin-vfs',
      '@arxhub/stdlib',
      '@arxhub/sync',
      '@arxhub/uikit',
      '@arxhub/vfs',
      '@arxhub/vfs-http',
      'elysia',
      'vue',
    ],
  }),
)
