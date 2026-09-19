import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/ui.ts', 'src/server.ts'],
    external: ['@arxhub/core', '@arxhub/plugin-gateway/server', '@arxhub/vfs', '@arxhub/vfs-http', '@arxhub/vfs-http/server'],
  }),
)
