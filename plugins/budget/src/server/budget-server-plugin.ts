import { Plugin, type PluginArgs, type PluginContext } from '@arxhub/core'
import { illegalState } from '@arxhub/errors'
import { GatewayServerExtension } from '@arxhub/plugin-gateway'
import { serverManifest } from '../manifest'
import { FnsReceiptClient, type FnsClientOptions } from './fns-client'
import { receiptRoutes } from './receipt-routes'

export interface BudgetServerPluginArgs extends PluginArgs {
  fns?: FnsClientOptions
}

export function readFnsConfig(env: Record<string, string | undefined>): FnsClientOptions | undefined {
  const baseUrl = env.ARXHUB_FNS_API_URL?.trim()
  const masterToken = env.ARXHUB_FNS_MASTER_TOKEN?.trim()
  if (!baseUrl && !masterToken) return undefined
  if (!baseUrl || !masterToken) throw illegalState('Configure both ARXHUB_FNS_API_URL and ARXHUB_FNS_MASTER_TOKEN for receipt download.')
  return { baseUrl, masterToken }
}

export class BudgetServerPlugin extends Plugin {
  private readonly client: FnsReceiptClient | null

  constructor(args: BudgetServerPluginArgs) {
    super(args, serverManifest)
    this.client = args.fns ? new FnsReceiptClient(args.fns) : null
  }

  override configure(ctx: PluginContext): void {
    super.configure(ctx)
    ctx.extensions.get(GatewayServerExtension).forPlugin(this).use(receiptRoutes(this.client))
  }
}
