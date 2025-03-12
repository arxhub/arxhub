import { defineConfig, mergeConfig } from 'vite'
import { createNodeConfig } from './src'

export default defineConfig(createNodeConfig(__dirname))