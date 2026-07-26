import { readFileSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// The instance reports the same version its package (and the Tauri bundle) is built from.
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [vue()],
  build: { outDir: 'dist' },
  // PGlite carries its Postgres build as .wasm and .tar.gz assets it resolves with new URL(...).
  // esbuild's dependency pre-bundling rewrites those URLs and the index then fails to start.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
})
