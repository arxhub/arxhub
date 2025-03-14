import { createNodeConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) => {
  return createNodeConfig(__dirname, env, ['src/collections/index.ts', 'src/errors/index.ts', 'src/fs/index.ts'])
})
