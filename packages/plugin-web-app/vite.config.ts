import { createNodeConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

// biome-ignore format: Manual formatting is more readable
export default defineConfig((env) => createNodeConfig(__dirname, env, [
	'src/manifest.ts',
	'src/api.ts',
	// 'src/client.ts',
	'src/server.ts',
]))

// TODO: Add static-copy files into dist folder