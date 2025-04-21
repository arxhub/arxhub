import { createNodeConfig } from '@arxhub/toolchain-vite'
import { glob } from 'glob'
import { defineConfig } from 'vite'

// biome-ignore format: Hand formatting is more readable
export default defineConfig((env) => createNodeConfig(__dirname, env, glob.sync('src/**/*.ts')))
