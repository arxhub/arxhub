import { homedir } from 'node:os'
import { join } from 'node:path'
import { ArxHub } from '@arxhub/core'
import GatewayServerPlugin from '@arxhub/plugin-gateway/server'
import { ProtectionServerPlugin } from '@arxhub/plugin-protection/server'
import { PUBLIC_READ_PATH, PublishServerPlugin } from '@arxhub/plugin-publish/server'
import { SyncServerPlugin } from '@arxhub/sync/server'
import { ScopedFileSystem } from '@arxhub/vfs'
import { VfsHttpServerPlugin } from '@arxhub/vfs-http/server'
import { NodeFileSystem } from '@arxhub/vfs-node'

// Local-only (never synced) home for the TOFU pin. Lives under state/, like the sync repo store.
const PINNED_KEY_FILE = 'state/protection/pinned-key'

export async function createArxHub(port: number, version: string): Promise<ArxHub> {
  const arxhub = new ArxHub()
  // Same knob as the server instance. E2E runs point it at a throwaway directory — otherwise a test
  // would pin its ephemeral key into the developer's real vault and unpair their actual devices.
  const dataDir = process.env.ARXHUB_DATA_DIR?.trim() || join(homedir(), 'ArxHub')
  const vfs = new NodeFileSystem(dataDir, arxhub.logger)

  // Persist the TOFU pin across restarts so a paired key survives the frequent dev-server restarts
  // (otherwise each restart reopens the trust-on-first-use window). Load before start so no request
  // races the load; ARXHUB_SYNC_PUBKEY still wins.
  const pinnedFile = vfs.file(PINNED_KEY_FILE)
  const persistedPin = (await pinnedFile.exists()) ? (await pinnedFile.readText()).trim() || undefined : undefined
  const pinnedPublicKey = process.env.ARXHUB_SYNC_PUBKEY ?? persistedPin

  // Cross-origin clients (desktop app / web SPA on another origin) need CORS headers or the browser
  // blocks sync. Signature auth has no ambient credential, so '*' is safe; ARXHUB_CORS_ORIGINS narrows it.
  const corsOrigins: string[] | '*' = process.env.ARXHUB_CORS_ORIGINS
    ? process.env.ARXHUB_CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : '*'

  arxhub.plugins.register(GatewayServerPlugin, () => ({ port, version }))
  // Guard every route with signed-request auth. TOFU pins the first valid client key and, via
  // onPair, persists it so the next boot loads it above. GETs under the published-content prefix
  // are the ONE deliberate public hole (read-only, method-restricted).
  arxhub.plugins.register(ProtectionServerPlugin, () => ({
    pinnedPublicKey,
    publicGetPrefixes: [PUBLIC_READ_PATH, '/healthcheck'],
    corsOrigins,
    onPair: (key: string) => {
      pinnedFile.writeText(key).catch((error) => arxhub.logger.error('Failed to persist pinned client key', error))
    },
  }))
  arxhub.plugins.register(VfsHttpServerPlugin, () => ({ vfs }))
  // Batched sync object store (client-encrypted blobs) under repo/.
  arxhub.plugins.register(SyncServerPlugin, () => ({ vfs: new ScopedFileSystem(vfs, 'repo') }))
  // Published (plaintext, world-readable) content under public/.
  arxhub.plugins.register(PublishServerPlugin, () => ({ vfs: new ScopedFileSystem(vfs, 'public') }))

  await arxhub.start()
  return arxhub
}
