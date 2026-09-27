import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/core/index.ts', 'src/hooks/index.ts'],
    // One module-level language for the whole app: a bundled copy would never hear the switch.
    external: ['@arxhub/i18n'],
  }),
)
