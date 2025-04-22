import { createNodeConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

// biome-ignore format: Manual formatting is more readable
export default defineConfig((env) => createNodeConfig(__dirname, env, [
	'src/manifest.ts',
	'src/api.ts',
	'src/server.ts',
]))
