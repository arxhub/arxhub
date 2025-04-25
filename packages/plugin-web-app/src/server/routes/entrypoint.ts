import { Elysia } from 'elysia'
import content from '../static/entrypoint.html?raw'

export function entrypointRoute() {
  return new Elysia().get('/', async () => {
    return new Response(content, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    })
  })
}
