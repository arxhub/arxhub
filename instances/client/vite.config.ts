import { readFileSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// The root package.json is the ONE version number (FR-211): every instance and the Tauri bundle read it
// from there, and CI holds the Rust crate to it — so a bump is one edit and no instance can drift on its own.
const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [vue()],
  build: { outDir: 'dist' },
  // PGlite carries its Postgres build as .wasm and .tar.gz assets it resolves with new URL(...).
  // esbuild's dependency pre-bundling rewrites those URLs and the index then fails to start.
  // Discover the lazy XLSX worker dependency before first use, so dev does not reload an edited workbook.
  optimizeDeps: { exclude: ['@electric-sql/pglite'], include: ['@arxhub/plugin-sheets > exceljs'] },
})
