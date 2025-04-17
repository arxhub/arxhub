import type { VirtualFile, VirtualFileSystem } from '@arxhub/plugin-vfs/api'
import Elysia from 'elysia'

export function filesRoute(prefix: string, vfs: VirtualFileSystem) {
  return (
    new Elysia({ prefix })
      .get('/list', async () => {
        const files: VirtualFile[] = []

        for await (const file of vfs.listFiles()) {
          files.push(file)
        }

        return {
          files: files.map((it) => it.props()),
        }
      })
      // .get('/list/:prefix{.+}?', async (ctx) => {
      //   const { vfs } = ctx.var
      //   const prefix = ctx.req.param('prefix') || '/'
      // })
      // .get('/list-v2/:prefix{.+}?', async (ctx) => {
      //   const { vfs } = ctx.var
      //   const prefix = ctx.req.param('prefix') || '/'
      // })
      // .post('/*', async ({ params }) => {
      //   const pathname = params['*']
      // })
      .get('/*', async ({ params }) => {
        const pathname = params['*']

        const file = await vfs.file(pathname)

        return {
          pathname: file.pathname,
          path: file.path,
          name: file.name,
          extension: file.extension,
          fields: file.fields,
          type: file.type,
          kind: file.kind,
        }
      })
    // .put('/*', async ({ params }) => {
    //   const pathname = params['*']
    // })
    // .delete('/*', async ({ params }) => {
    //   const pathname = params['*']
    // })
  )
}
