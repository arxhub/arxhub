import { randomBytes } from 'node:crypto'
import type { VirtualFileSystem } from '@arxhub/vfs'

export const MCP_TOKEN_PATH = 'state/AiWorkspace/mcp-token'

export async function ensureMcpChannelToken(root: VirtualFileSystem, envToken?: string): Promise<string> {
  const fromEnv = envToken?.trim()
  if (fromEnv) {
    await root.file(MCP_TOKEN_PATH).writeText(`${fromEnv}\n`)
    return fromEnv
  }
  const file = root.file(MCP_TOKEN_PATH)
  if (await file.exists()) {
    const existing = (await file.readText()).trim()
    if (existing) return existing
  }
  const token = randomBytes(24).toString('base64url')
  await file.writeText(`${token}\n`)
  return token
}

export async function readMcpChannelToken(root: VirtualFileSystem): Promise<string | null> {
  const file = root.file(MCP_TOKEN_PATH)
  if (!(await file.exists())) return null
  const token = (await file.readText()).trim()
  return token || null
}
