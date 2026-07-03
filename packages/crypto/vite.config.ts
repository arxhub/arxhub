import { createBrowserConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

// biome-ignore format: Hand formatting is more readable
export default defineConfig((env) => createBrowserConfig(__dirname, env))
