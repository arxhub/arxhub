import { createNodeConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

// biome-ignore format: Hand formatting is more readable
export default defineConfig((env) => createNodeConfig(__dirname, env, [
	'src/client.ts',
	'src/server.ts',
	'src/api.ts',
	'src/manifest.ts',
]))
