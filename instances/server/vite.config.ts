import { defineConfig } from 'vite'

export default defineConfig((env) => {
  if (env.command === 'build') {
    return {
      resolve: { tsconfigPaths: true },
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
    appType: 'custom',
    plugins: [
      {
        name: 'vite-plugin-arxhub-server',
        apply: 'serve',

        async configureServer(server) {
          const { createArxHub } = await server.ssrLoadModule('/src/arxhub.ts')
          const arxhub = await createArxHub()

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
