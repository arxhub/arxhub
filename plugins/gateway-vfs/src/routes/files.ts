import type { VirtualFile } from '@arxhub/plugin-vfs/api'
import { Hono } from 'hono'
import type { FilesEnv } from '../types'

export const files = new Hono<FilesEnv>()
  //
  // --- --- ---
  //
  .get('/list', async (ctx) => {
    const files: VirtualFile[] = []
    for await (const file of ctx.var.vfs.listFiles()) {
      files.push(file)
    }
    return ctx.json(
      {
        files: files.map((it) => it.props()),
      },
      200,
    )
  })
  // .get('/list/:prefix{.+}?', async (ctx) => {
  //   const { vfs } = ctx.var
  //   const prefix = ctx.req.param('prefix') || '/'
  // })
  // .get('/list-v2/:prefix{.+}?', async (ctx) => {
  //   const { vfs } = ctx.var
  //   const prefix = ctx.req.param('prefix') || '/'
  // })
  //
  // --- --- ---
  //
  .post('/:pathname{.+}', async (ctx) => {
    const { vfs } = ctx.var
    const pathname = ctx.req.param('pathname')
  })
  .get('/:pathname{.+}', async (ctx) => {
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
  .put('/:pathname{.+}', async (ctx) => {
    const { vfs } = ctx.var
    const pathname = ctx.req.param('pathname')
  })
  .delete('/:pathname{.+}', async (ctx) => {
    const { vfs } = ctx.var
    const pathname = ctx.req.param('pathname')
  })
