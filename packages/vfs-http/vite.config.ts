import { createNodeConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) => createNodeConfig(__dirname, env, ['src/index.ts', 'src/protocol.ts', 'src/server.ts']))
