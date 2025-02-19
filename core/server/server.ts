import { Hono } from '@third-party/hono'
import { HonoOptions } from '@third-party/hono/hono-base'
import { BlankEnv } from '@third-party/hono/types'

export class Server extends Hono {
  private httpServer: Deno.HttpServer | null

  constructor(options?: HonoOptions<BlankEnv>) {
    super(options)
    this.httpServer = null
  }

  serve(): Promise<void> {
    this.httpServer = Deno.serve(this.fetch)
    return Promise.resolve()
  }

  shutdown(): Promise<void> {
    const httpServer = this.httpServer
    this.httpServer = null
    return httpServer == null ? Promise.resolve() : httpServer.shutdown()
  }
}
