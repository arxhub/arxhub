import { isAppError } from '@arxhub/errors'
import type { VirtualFileSystem } from '@arxhub/vfs'
import Elysia, { status, t } from 'elysia'
import { AiSessionStore } from '../session-store'
import { AiWorkspaceMcpHost } from './mcp'

function renderError(error: unknown) {
  if (isAppError(error)) return status(error.body.statusCode, error.render())
  const message = error instanceof Error ? error.message : String(error)
  return status(500, { code: 'InternalServerError', statusCode: 500, title: 'Internal Server Error', message })
}

export function aiWorkspaceRoutes(root: VirtualFileSystem) {
  const store = new AiSessionStore(root)
  const mcp = new AiWorkspaceMcpHost(store)

  const routes = new Elysia()
    .all('/mcp', async ({ request }) => mcp.handle(request))
    .get('/sessions', async () => {
      try {
        return { sessions: await store.listSessions() }
      } catch (error) {
        return renderError(error)
      }
    })
    .get('/sessions/:sessionId', async ({ params }) => {
      try {
        const view = await store.getSessionView(params.sessionId)
        return {
          sessionId: view.meta.sessionId,
          baseSnapshotHash: view.meta.baseSnapshotHash,
          status: view.meta.status,
          result: view.meta.result,
          createdAt: view.meta.createdAt,
          proposedAt: view.meta.proposedAt,
          changes: view.changes,
          actions: view.actions,
          sources: view.sources,
        }
      } catch (error) {
        return renderError(error)
      }
    })
    .post(
      '/sessions/:sessionId/files/read',
      async ({ params, body }) => {
        try {
          const content = await store.readFile(params.sessionId, body.pathname)
          return { content, sources: await store.readSources(params.sessionId) }
        } catch (error) {
          return renderError(error)
        }
      },
      { body: t.Object({ pathname: t.String({ minLength: 1 }) }) },
    )
    .post(
      '/sessions/:sessionId/files/write',
      async ({ params, body }) => {
        try {
          await store.writeFile(params.sessionId, body.pathname, body.content)
          return { ok: true }
        } catch (error) {
          return renderError(error)
        }
      },
      { body: t.Object({ pathname: t.String({ minLength: 1 }), content: t.String() }) },
    )
    .post(
      '/sessions/:sessionId/files/compare',
      async ({ params, body }) => {
        try {
          return await store.compare(params.sessionId, body.pathname, body.mode)
        } catch (error) {
          return renderError(error)
        }
      },
      {
        body: t.Object({
          pathname: t.String({ minLength: 1 }),
          mode: t.Union([t.Literal('agent'), t.Literal('apply')]),
        }),
      },
    )
    .post(
      '/sessions/:sessionId/accept',
      async ({ params, body }) => {
        try {
          return await store.accept(params.sessionId, { clientApplied: body?.clientApplied === true })
        } catch (error) {
          return renderError(error)
        }
      },
      { body: t.Optional(t.Object({ clientApplied: t.Optional(t.Boolean()) })) },
    )
    .post('/sessions/:sessionId/reject', async ({ params }) => {
      try {
        return await store.reject(params.sessionId)
      } catch (error) {
        return renderError(error)
      }
    })

  return { routes, mcp }
}

export type AiWorkspaceRoutes = ReturnType<typeof aiWorkspaceRoutes>['routes']
