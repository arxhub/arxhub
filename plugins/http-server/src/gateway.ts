import { type ServerType as HttpServer, serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { HonoOptions } from 'hono/hono-base'
import type { BlankEnv } from 'hono/types'

export class Gateway extends Hono {
  private httpServer: HttpServer | null

  constructor(options?: HonoOptions<BlankEnv>) {
    super(options)
    this.httpServer = null
    this.get('/healthcheck', (c) => c.text('200 OK'))
  }

  serve(): Promise<void> {
    this.httpServer = serve(this)
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    const httpServer = this.httpServer
    this.httpServer = null

    return new Promise((resolve, reject) => {
      if (httpServer == null) {
        resolve()
        return
      }

      httpServer.close((err) => (err == null ? resolve() : reject(err)))
    })
  }
}
