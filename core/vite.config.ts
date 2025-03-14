import { defineConfig } from 'vite'
import { createNodeConfig } from '@arxhub/toolchain-vite'

export default defineConfig((env) => createNodeConfig(__dirname, env))
