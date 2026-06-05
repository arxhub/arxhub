import { homedir } from 'node:os'
import { join } from 'node:path'
import { ArxHub } from '@arxhub/core'
import GatewayServerPlugin from '@arxhub/plugin-gateway/server'
import { VfsHttpServerPlugin } from '@arxhub/vfs-http/server'
import { NodeFileSystem } from '@arxhub/vfs-node'

export async function createArxHub(port: number): Promise<ArxHub> {
  const arxhub = new ArxHub()
  const vfs = new NodeFileSystem(join(homedir(), '.arxhub'), arxhub.logger)

  arxhub.plugins.register(GatewayServerPlugin, () => ({ port }))
  arxhub.plugins.register(VfsHttpServerPlugin, () => ({ vfs }))

  await arxhub.start()
  return arxhub
}
