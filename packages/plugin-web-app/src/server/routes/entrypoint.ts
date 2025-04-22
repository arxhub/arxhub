import { Elysia } from 'elysia'
import html from '../files/index.html?raw'

export function entrypointRoute() {
  return new Elysia().get('/', async () => {
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    })
  })
}
