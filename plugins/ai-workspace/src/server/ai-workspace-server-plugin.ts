import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { GatewayServerExtension } from '@arxhub/plugin-gateway'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { serverManifest } from '../manifest'
import type { AiWorkspaceMcpHost } from './mcp'
import { ensureMcpChannelToken } from './mcp-token'
import { aiWorkspaceRoutes } from './routes'

type AiWorkspaceServerPluginArgs = PluginArgs & {
  vfs: VirtualFileSystem
}

export class AiWorkspaceServerPlugin extends Plugin {
  private readonly vfs: VirtualFileSystem
  private mcpHost: AiWorkspaceMcpHost | null = null

  constructor(args: AiWorkspaceServerPluginArgs) {
    super(args, serverManifest)
    this.vfs = args.vfs
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    const { routes, mcp } = aiWorkspaceRoutes(this.vfs)
    this.mcpHost = mcp
    ctx.extensions.get(GatewayServerExtension).forPlugin(this).use(routes)
  }

  override async start(ctx: PluginContext): Promise<void> {
    await super.start(ctx)
    const token = await ensureMcpChannelToken(this.vfs, process.env.ARXHUB_AI_WORKSPACE_MCP_TOKEN)
    this.logger.info(
      `AiWorkspace MCP channel at /api/ai-workspace/mcp (Bearer token in state/AiWorkspace/mcp-token, length ${token.length})`,
    )
  }

  override async stop(ctx: PluginContext): Promise<void> {
    await this.mcpHost?.close()
    this.mcpHost = null
    await super.stop(ctx)
  }
}
