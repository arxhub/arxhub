import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { request } from 'node:http'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// The instance reports the same version its package (and the Tauri bundle) is built from.
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string

const API_PREFIXES = ['/api', '/healthcheck']

function apiProxy(port: number) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!API_PREFIXES.some((p) => req.url?.startsWith(p))) return next()
    const proxy = request({ hostname: 'localhost', port, path: req.url, method: req.method, headers: req.headers }, (upstream) => {
      res.writeHead(upstream.statusCode ?? 200, upstream.headers)
      upstream.pipe(res, { end: true })
    })
    proxy.on('error', next)
    req.pipe(proxy, { end: true })
  }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    vue(),
    {
      name: 'vite-plugin-arxhub-dev',
      apply: 'serve',

      async configureServer(server) {
        const { createArxHub } = await server.ssrLoadModule('/src/server/arxhub.ts')
        const arxhub = await createArxHub(Number(process.env.ARXHUB_PORT) || 3001)

        const { GatewayServerExtension } = await server.ssrLoadModule('/node_modules/@arxhub/plugin-gateway/src/server/extension.ts')
        const apiPort = arxhub.extensions.get(GatewayServerExtension).gateway.port ?? 3001

        server.middlewares.use(apiProxy(apiPort))

        server.httpServer?.on('close', async () => {
          await arxhub?.stop()
        })

        const handleChange = async (file: string) => {
          if (!/\/src\/server\//.test(file)) return
          server.config.logger.info('[arxhub] server changed, restarting...')
          server.watcher.off('change', handleChange)
          await arxhub?.stop()
          await server.restart()
        }

        server.watcher.on('change', handleChange)
      },
    },
  ],
  server: {
    port: 3000,
  },
  // PGlite carries its Postgres build as .wasm and .tar.gz assets it resolves with new URL(...).
  // esbuild's dependency pre-bundling rewrites those URLs and the index then fails to start.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
})
