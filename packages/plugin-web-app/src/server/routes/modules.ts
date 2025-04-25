import type { Bundler } from '@arxhub/bundler'
import Elysia from 'elysia'

export function modulesRoute(bundler: Bundler) {
  return new Elysia().get('/modules/:type', async ({ params }) => {
    const { content, contentType } = await bundler.build(params.type)
    return new Response(content, {
      headers: { 'content-type': contentType },
    })
  })
}
