import { createTauriConfig } from '@arxhub/toolchain-vite'
import { defineConfig } from 'vite'

export default defineConfig((env) => createTauriConfig(__dirname, env))
