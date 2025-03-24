import { isRenderableError } from '@arxhub/stdlib/errors/app-error'
import { InternalError } from '@arxhub/stdlib/errors/internal-error'
import { type ServerType as HttpServer, serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { HonoOptions } from 'hono/hono-base'
import { HTTPException } from 'hono/http-exception'
import type { BlankEnv } from 'hono/types'

export class Gateway extends Hono {
  private httpServer: HttpServer | null

  constructor(options?: HonoOptions<BlankEnv>) {
    super(options)
    this.httpServer = null
    this.onError((err, ctx) => {
      // Backend errors
      if (isRenderableError(err)) {
        const response = err.render()
        return ctx.json(
          response,
          // @ts-expect-error: Hono have typecheck for valid number for status code
          response.statusCode,
        )
      }

      // Hono errors
      if (err instanceof HTTPException) {
        return err.getResponse()
      }

      // Unhandled errors
      const response = new InternalError(err.message).render()
      return ctx.json(
        response,
        // @ts-expect-error: Hono have typecheck for valid number for status code
        response.statusCode,
      )
    })
  }

  serve(): Promise<void> {
    this.httpServer = serve(this)
    return Promise.resolve()
  }

  close(): Promise<void> {
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
