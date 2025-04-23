import { createNodeConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) => createNodeConfig(__dirname, env, [
  'src/manifest.ts',
  'src/server.ts',
]))
