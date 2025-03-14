import { createNodeConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

// biome-ignore format: Hand formatting is more readable
export default defineConfig((env) => createNodeConfig(__dirname, env, [
  'src/collections/index.ts',
  'src/errors/index.ts',
  'src/fs/index.ts',
]))
