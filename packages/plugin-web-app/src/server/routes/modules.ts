import type { Bundler } from '@arxhub/bundler'
import Elysia from 'elysia'

export function modulesRoute(bundler: Bundler) {
  return new Elysia().get('/modules/:type', async ({ params }) => {
    return new Response(await bundler.build(params.type), {
      headers: { 'Content-Type': 'application/javascript' },
    })
  })
}
