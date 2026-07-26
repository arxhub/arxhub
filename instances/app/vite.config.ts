import { readFileSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// The instance reports the same version its package (and the Tauri bundle) is built from.
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST

// Which frame this bundle ships. Tauri exports the target platform for both `tauri dev` and
// `tauri build`, so an Android package carries the mobile shell and nothing else. A plain `vite dev`
// (browser development, no Tauri) leaves it unset and is a desktop bundle.
// @ts-expect-error process is a nodejs global
const tauriPlatform = process.env.TAURI_ENV_PLATFORM
const frame = tauriPlatform === 'android' || tauriPlatform === 'ios' ? 'mobile' : 'desktop'

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue()],
  define: { __APP_VERSION__: JSON.stringify(version), __ARXHUB_FRAME__: JSON.stringify(frame) },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
    // Browser dev: proxy all API calls (VFS, sync, publish — all under /api/<namespace>) to the
    // ArxHub server (instances/server, port 3000). Same-origin via the proxy, so no CORS needed here.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
}))
