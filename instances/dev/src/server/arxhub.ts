import { homedir } from 'node:os'
import { join } from 'node:path'
import { ArxHub } from '@arxhub/core'
import GatewayServerPlugin from '@arxhub/plugin-gateway/server'
import { ProtectionServerPlugin } from '@arxhub/plugin-protection/server'
import { VfsHttpServerPlugin } from '@arxhub/vfs-http/server'
import { NodeFileSystem } from '@arxhub/vfs-node'

// Local-only (never synced) home for the TOFU pin. Lives under state/, like the sync repo store.
const PINNED_KEY_FILE = 'state/protection/pinned-key'

export async function createArxHub(port: number): Promise<ArxHub> {
  const arxhub = new ArxHub()
  const vfs = new NodeFileSystem(join(homedir(), '.arxhub'), arxhub.logger)

  // Persist the TOFU pin across restarts so a paired key survives the frequent dev-server restarts
  // (otherwise each restart reopens the trust-on-first-use window). Load before start so no request
  // races the load; ARXHUB_SYNC_PUBKEY still wins.
  const pinnedFile = vfs.file(PINNED_KEY_FILE)
  const persistedPin = (await pinnedFile.exists()) ? (await pinnedFile.readText()).trim() || undefined : undefined
  const pinnedPublicKey = process.env.ARXHUB_SYNC_PUBKEY ?? persistedPin

  arxhub.plugins.register(GatewayServerPlugin, () => ({ port }))
  // Guard every /vfs route with signed-request auth. TOFU pins the first valid client key and, via
  // onPair, persists it so the next boot loads it above.
  arxhub.plugins.register(ProtectionServerPlugin, () => ({
    pinnedPublicKey,
    onPair: (key: string) => {
      pinnedFile.writeText(key).catch((error) => arxhub.logger.error('Failed to persist pinned client key', error))
    },
  }))
  arxhub.plugins.register(VfsHttpServerPlugin, () => ({ vfs }))

  await arxhub.start()
  return arxhub
}
