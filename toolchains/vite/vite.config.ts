import { defineConfig } from 'vite'
import { createNodeConfig } from './src'

export default defineConfig((env) => createNodeConfig(__dirname, env))
