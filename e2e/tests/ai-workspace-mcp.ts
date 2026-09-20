import type { APIResponse, Page } from '@playwright/test'
import { signedPost } from './signed-request'

const MCP_PATH = '/api/ai-workspace/mcp'

type JsonRpc = {
  jsonrpc: '2.0'
  id?: number | string
  method?: string
  params?: unknown
  result?: unknown
  error?: { code: number; message: string }
}

async function mcpPost(page: Page, mnemonic: string, body: JsonRpc, sessionId?: string): Promise<APIResponse> {
  const headers: Record<string, string> = {
    'mcp-protocol-version': '2024-11-05',
    accept: 'application/json, text/event-stream',
  }
  if (sessionId) headers['mcp-session-id'] = sessionId
  return signedPost(page, mnemonic, MCP_PATH, body, headers)
}

export async function mcpCallTool(
  page: Page,
  mnemonic: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ ok: boolean; text: string }> {
  const init = await mcpPost(page, mnemonic, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'arxhub-e2e', version: '0.1.0' },
    },
  })
  if (!init.ok()) {
    throw new Error(`MCP initialize failed: ${init.status()} ${await init.text()}`)
  }
  const sessionId = init.headers()['mcp-session-id']
  if (!sessionId) throw new Error('MCP initialize did not return mcp-session-id')

  await mcpPost(page, mnemonic, { jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId)

  const call = await mcpPost(
    page,
    mnemonic,
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name, arguments: args },
    },
    sessionId,
  )
  const raw = (await call.json()) as JsonRpc
  if (!call.ok() || raw.error) {
    throw new Error(`MCP tools/call ${name} failed: ${call.status()} ${JSON.stringify(raw)}`)
  }
  const result = raw.result as { content?: Array<{ type: string; text?: string }>; isError?: boolean } | undefined
  const text = result?.content?.map((c) => c.text ?? '').join('\n') ?? ''
  if (result?.isError) throw new Error(`MCP tool ${name} error: ${text}`)
  return { ok: true, text }
}
