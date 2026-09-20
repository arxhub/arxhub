import { randomUUID } from 'node:crypto'
import { isAppError } from '@arxhub/errors'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { AiSessionStore } from '../session-store'

type SessionTransport = {
  server: McpServer
  transport: WebStandardStreamableHTTPServerTransport
}

function textResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data) }],
  }
}

function errorResult(error: unknown) {
  const message = isAppError(error)
    ? error.message
    : error instanceof Error
      ? error.message
      : String(error)
  return { content: [{ type: 'text' as const, text: message }], isError: true as const }
}

export function createAiWorkspaceMcpServer(store: AiSessionStore): McpServer {
  const server = new McpServer({ name: 'arxhub-ai-workspace', version: '0.1.0' })

  server.registerTool(
    'create_session',
    {
      description: 'Create an isolated agent worktree session. Writes go to the overlay until propose+accept.',
    },
    async () => {
      try {
        return textResult(await store.createSession())
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'read',
    {
      description: 'Read a vault file in the session context (overlay wins over main).',
      inputSchema: {
        sessionId: z.string().min(1),
        pathname: z.string().min(1),
      },
    },
    async ({ sessionId, pathname }) => {
      try {
        const content = await store.readFile(sessionId, pathname)
        return textResult({ content, sources: await store.readSources(sessionId) })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'search',
    {
      description: 'Search vault text in the session context and record sources.',
      inputSchema: {
        sessionId: z.string().min(1),
        query: z.string().min(1),
      },
    },
    async ({ sessionId, query }) => {
      try {
        return textResult(await store.search(sessionId, query))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'write',
    {
      description: 'Write a file into the session overlay (never the main vault).',
      inputSchema: {
        sessionId: z.string().min(1),
        pathname: z.string().min(1),
        content: z.string(),
      },
    },
    async ({ sessionId, pathname, content }) => {
      try {
        await store.writeFile(sessionId, pathname, content)
        return textResult({ ok: true })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'mkdir',
    {
      description: 'Create a directory in the session overlay.',
      inputSchema: {
        sessionId: z.string().min(1),
        pathname: z.string().min(1),
      },
    },
    async ({ sessionId, pathname }) => {
      try {
        await store.mkdir(sessionId, pathname)
        return textResult({ ok: true })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'rename',
    {
      description: 'Rename a path in the session overlay.',
      inputSchema: {
        sessionId: z.string().min(1),
        fromPath: z.string().min(1),
        toPath: z.string().min(1),
      },
    },
    async ({ sessionId, fromPath, toPath }) => {
      try {
        await store.rename(sessionId, fromPath, toPath)
        return textResult({ ok: true })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'delete',
    {
      description: 'Delete a path in the session overlay.',
      inputSchema: {
        sessionId: z.string().min(1),
        pathname: z.string().min(1),
      },
    },
    async ({ sessionId, pathname }) => {
      try {
        await store.deletePath(sessionId, pathname)
        return textResult({ ok: true })
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'propose',
    {
      description: 'Mark the session ready for human review (MR-style proposal).',
      inputSchema: {
        sessionId: z.string().min(1),
      },
    },
    async ({ sessionId }) => {
      try {
        return textResult(await store.propose(sessionId))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  return server
}

export class AiWorkspaceMcpHost {
  private readonly sessions = new Map<string, SessionTransport>()

  constructor(private readonly store: AiSessionStore) {}

  async handle(request: Request): Promise<Response> {
    const sessionId = request.headers.get('mcp-session-id')

    if (sessionId && this.sessions.has(sessionId)) {
      const entry = this.sessions.get(sessionId)
      if (!entry) return this.missingSession()
      return entry.transport.handleRequest(request)
    }

    if (sessionId) return this.missingSession()

    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: expected initialize POST' }, id: null }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    let body: unknown
    try {
      body = await request.clone().json()
    } catch {
      return new Response(
        JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    if (!isInitializeRequest(body)) {
      return new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: no MCP session; send initialize first' },
          id: null,
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    }

    const server = createAiWorkspaceMcpServer(this.store)
    let transport!: WebStandardStreamableHTTPServerTransport
    transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => {
        this.sessions.set(id, { server, transport })
      },
    })
    transport.onclose = () => {
      const id = transport.sessionId
      if (id) this.sessions.delete(id)
    }

    await server.connect(transport)
    return transport.handleRequest(request)
  }

  async close(): Promise<void> {
    for (const { server, transport } of this.sessions.values()) {
      await transport.close().catch(() => undefined)
      await server.close().catch(() => undefined)
    }
    this.sessions.clear()
  }

  private missingSession(): Response {
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    )
  }
}
