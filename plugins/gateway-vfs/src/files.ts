import { Hono } from 'hono'
import type { FilesEnv } from './types'

export const files = new Hono<FilesEnv>()

files.get('/:pathname{.+}', async (ctx) => {
  const { vfs } = ctx.var
  const pathname = ctx.req.param('pathname')

  const file = await vfs.file(pathname)

  return ctx.json({
    pathname: file.pathname,
    path: file.path,
    name: file.name,
    extension: file.extension,
    fields: file.fields,
    type: file.type,
    kind: file.kind,
  })
})
