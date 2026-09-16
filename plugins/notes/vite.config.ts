import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/ui.ts', 'src/notes-type.ts'],
    external: ['@arxhub/core', '@arxhub/errors', '@arxhub/vfs', '@arxhub/uikit', '@arxhub/plugin-shell', 'vue'],
  }),
)
