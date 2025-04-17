import type { ArxHub, Logger } from '@arxhub/core'
import { Plugin } from '@arxhub/core'
import { GatewayExtension } from '@arxhub/plugin-gateway/api'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import manifest from './manifest'

export class WebAppPlugin extends Plugin<ArxHub> {
  private logger!: Logger

  constructor() {
    super(manifest)
  }

  override create(target: ArxHub): void {
    this.logger = target.logger.child(`[${this.name}] - `)
    // Register extensions if the web-app provides any configuration points
    // Example: context.extensions.register(new WebAppConfigExtension());
  }

  override configure(target: ArxHub): void {
    this.logger.info('Plugin configuring...')
    // Configuration steps: Tell the gateway where to find UI assets.
    const { gateway } = target.extensions.get(GatewayExtension)

    // Determine path to index.html
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    const indexHtmlPath = path.resolve(__dirname, '..', 'public', 'index.html')

    this.logger.info(`Configuring gateway to serve index.html from: ${indexHtmlPath}`)

    // Add route to serve index.html for the root path
    gateway.get('/', async (ctx) => {
      try {
        const content = await fs.readFile(indexHtmlPath, 'utf-8')
        // Assuming ctx.html() sets the Content-Type to text/html
        return ctx.html(content)
      } catch (error) {
        this.logger.error('Failed to read index.html:', error)
        // Assuming ctx.text() and ctx.status() exist
        ctx.status(500)
        return ctx.text('Internal Server Error: Could not load application.')
      }
    })
    this.logger.info('Added route for / to serve index.html.')

    // Placeholder for serving client assets later
    // gateway.addStaticRoute('/assets', path.resolve(__dirname, '..', 'dist'));
    this.logger.info('Placeholder for /assets route (not yet implemented).')


    // Example: Add a simple API route handled by this plugin
    gateway.get('/api/web-app/ping', async (ctx) => {
      return ctx.json({ pong: new Date().toISOString() })
    })
    this.logger.info('Added /api/webapp/ping route.')
  }
}

export default WebAppPlugin
