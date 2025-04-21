import type { SearchableFileSystem } from '@arxhub/plugin-vfs/api'
import { Elysia } from 'elysia'

export function entrypointRoute(files: SearchableFileSystem) {
  return new Elysia().get('/', async () => {
    const html = await files.readTextFile('/node_modules/@arxhub/web-app/files/index.html')
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    })
  })
}
