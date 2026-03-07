import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/core/index.ts', 'src/hooks/index.ts', 'src/desktop/index.ts', 'src/mobile/index.ts'],
  }),
)
