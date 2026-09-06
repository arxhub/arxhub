import { createVueConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

// Two entries, matching the two exports: the data half and the generated-form half, which is Vue.
export default defineConfig((env) =>
  createVueConfig(__dirname, env, {
    entries: ['src/index.ts', 'src/ui/index.ts'],
    external: ['@arxhub/di', '@arxhub/errors', '@arxhub/logger', '@arxhub/uikit', '@arxhub/vfs', '@sinclair/typebox', 'smol-toml', 'vue'],
  }),
)
