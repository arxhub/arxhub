import { type ConfigEnv, type UserConfig, defineConfig, mergeConfig } from 'vite'
import { createVueConfig } from './vue'

export function createTauriConfig(dirname: string, env: ConfigEnv): UserConfig {
  return mergeConfig(
    createVueConfig(dirname, env, { lib: false }),
    defineConfig({
      // Tauri expects a fixed dev server port
      server: {
        port: 1420,
        strictPort: true,
        host: '0.0.0.0',
        hmr: { protocol: 'ws', host: 'localhost', port: 1420 },
      },
      // Prevent vite from obscuring Rust errors
      clearScreen: false,
      // Expose TAURI_ env vars to the frontend
      envPrefix: ['VITE_', 'TAURI_'],
    }),
  )
}
