import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// The root package.json is the ONE version number (FR-211): every instance and the Tauri bundle read it
// from there, and CI holds the Rust crate to it — so a bump is one edit and no instance can drift on its own. The healthcheck
// answers with it (FR-210), so the server bundle needs the define the client bundles already had.
const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string
const define = { __APP_VERSION__: JSON.stringify(version) }

export default defineConfig((env) => {
  // Vitest loads this file too; the dev branch below would boot the whole server under it.
  if (env.mode === 'test') return { test: { include: ['src/**/*.test.ts'] } }

  if (env.command === 'build') {
    return {
      define,
      // Dual-entry workspace packages (@arxhub/path, @arxhub/crypto) default to their browser entry
      // otherwise, and this build targets Node — path-browserify is CJS, so its named exports break
      // at runtime under ESM.
      resolve: { tsconfigPaths: true, conditions: ['node', 'import', 'module', 'default'] },
      build: {
        outDir: 'dist',
        target: 'esnext',
        minify: false,
        sourcemap: true,
        lib: {
          formats: ['es'],
          entry: './src/main.ts',
          fileName: () => 'main.js',
        },
        rollupOptions: {
          // Bundle workspace packages (they have TS source, no dist).
          // Externalize everything else (node builtins, npm deps).
          external: (id: string) => {
            if (id.startsWith('.') || id.startsWith('/') || id.startsWith('@arxhub/')) return false
            return true
          },
          output: {
            preserveModules: false,
          },
        },
      },
    }
  }

  // Dev: Vite acts as watcher; Elysia serves the API on port 3000
  return {
    define,
    appType: 'custom',
    plugins: [
      {
        name: 'vite-plugin-arxhub-server',
        apply: 'serve',

        async configureServer(server) {
          const { createArxHub } = await server.ssrLoadModule('/src/arxhub.ts')
          const arxhub = await createArxHub({ version })

          server.httpServer?.on('close', async () => {
            await arxhub?.stop()
          })

          const handleChange = async (file: string) => {
            if (!/\/src\//.test(file)) return
            server.config.logger.info('[arxhub] server changed, restarting...')
            server.watcher.off('change', handleChange)
            await arxhub?.stop()
            await server.restart()
          }

          server.watcher.on('change', handleChange)
        },
      },
    ],
  }
})
