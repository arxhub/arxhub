import { homedir } from 'node:os'
import { join } from 'node:path'
import { ArxHub } from '@arxhub/core'
import GatewayServerPlugin from '@arxhub/plugin-gateway/server'
import { ProtectionServerPlugin } from '@arxhub/plugin-protection/server'
import { VfsHttpServerPlugin } from '@arxhub/vfs-http/server'
import { NodeFileSystem } from '@arxhub/vfs-node'

export async function createArxHub(port: number): Promise<ArxHub> {
  const arxhub = new ArxHub()
  const vfs = new NodeFileSystem(join(homedir(), '.arxhub'), arxhub.logger)

  arxhub.plugins.register(GatewayServerPlugin, () => ({ port }))
  // Guard every /vfs route with signed-request auth. TOFU: the first validly-signed client key is
  // pinned. Set ARXHUB_SYNC_PUBKEY to pin a specific xpub and disable TOFU.
  arxhub.plugins.register(ProtectionServerPlugin, () => ({ pinnedPublicKey: process.env.ARXHUB_SYNC_PUBKEY }))
  arxhub.plugins.register(VfsHttpServerPlugin, () => ({ vfs }))

  await arxhub.start()
  return arxhub
}
