import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Logger } from '@arxhub/core'
import { NodeFileSystem } from '@arxhub/vfs-node'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AiSessionStore } from '../session-store'
import { AiWorkspaceMcpHost } from '../server/mcp'

const silent: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => silent,
}

describe('AiWorkspace MCP host', () => {
  let dir: string
  let root: NodeFileSystem
  let host: AiWorkspaceMcpHost

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ai-workspace-mcp-'))
    root = new NodeFileSystem(dir, silent)
    await root.file('vault/note.md').writeText('hello agent\n')
    host = new AiWorkspaceMcpHost(new AiSessionStore(root))
  })

  afterEach(async () => {
    await host.close()
    await rm(dir, { recursive: true, force: true })
  })

  async function callTool(name: string, args: Record<string, unknown> = {}) {
    const init = await host.handle(
      new Request('http://127.0.0.1/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2024-11-05',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test', version: '0' },
          },
        }),
      }),
    )
    expect(init.status).toBe(200)
    const sessionId = init.headers.get('mcp-session-id')
    expect(sessionId).toBeTruthy()

    await host.handle(
      new Request('http://127.0.0.1/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-session-id': sessionId!,
          'mcp-protocol-version': '2024-11-05',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      }),
    )

    const call = await host.handle(
      new Request('http://127.0.0.1/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-session-id': sessionId!,
          'mcp-protocol-version': '2024-11-05',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: { name, arguments: args },
        }),
      }),
    )
    expect(call.status).toBe(200)
    const json = (await call.json()) as {
      result?: { content?: Array<{ text?: string }>; isError?: boolean }
      error?: unknown
    }
    expect(json.error).toBeUndefined()
    const text = json.result?.content?.map((c) => c.text ?? '').join('') ?? ''
    expect(json.result?.isError).not.toBe(true)
    return JSON.parse(text) as Record<string, unknown>
  }

  it('create_session + write keep main vault unchanged', async () => {
    const session = await callTool('create_session')
    expect(session.sessionId).toBeTruthy()
    await callTool('write', {
      sessionId: session.sessionId,
      pathname: 'note.md',
      content: 'from mcp\n',
    })
    expect(await root.file('vault/note.md').readText()).toBe('hello agent\n')
  })
})
