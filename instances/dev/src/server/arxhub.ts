import { homedir } from 'node:os'
import { join } from 'node:path'
import { bootServer } from '@arxhub/boot/server'
import type { ArxHub } from '@arxhub/core'
import { AiWorkspaceServerPlugin, ensureMcpChannelToken } from '@arxhub/plugin-ai-workspace/server'
import { BudgetServerPlugin, readFnsConfig } from '@arxhub/plugin-budget/server'
import GatewayServerPlugin from '@arxhub/plugin-gateway/server'
import { ProtectionServerPlugin } from '@arxhub/plugin-protection/server'
import { PUBLIC_READ_PATH, PublishServerPlugin } from '@arxhub/plugin-publish/server'
import { SyncServerPlugin } from '@arxhub/plugin-sync/server'
import { VfsHttpServerPlugin } from '@arxhub/plugin-vfs/server'
import { ScopedFileSystem } from '@arxhub/vfs'

// Local-only (never synced) home for the TOFU pin. Lives under state/, like the sync repo store.
const PINNED_KEY_FILE = 'state/protection/pinned-key'

export async function createArxHub(port: number, version: string): Promise<ArxHub> {
  const arxhub = await bootServer({
    // Same knob as the server instance. E2E runs point it at a throwaway directory — otherwise a test
    // would pin its ephemeral key into the developer's real vault and unpair their actual devices.
    dataDir: process.env.ARXHUB_DATA_DIR?.trim() || join(homedir(), 'ArxHub'),
    version,

    register: async (hub, { vfs, logger }) => {
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

      hub.plugins.register(GatewayServerPlugin, () => ({ port, version }))
      // Guard every route with signed-request auth. TOFU pins the first valid client key and, via
      // onPair, persists it so the next boot loads it above. GETs under the published-content prefix
      // are the ONE deliberate public hole (read-only, method-restricted).
      hub.plugins.register(ProtectionServerPlugin, () => ({
        pinnedPublicKey,
        publicGetPrefixes: [PUBLIC_READ_PATH],
        corsOrigins,
        bearerAuth: [
          {
            pathPrefix: '/api/ai-workspace/mcp',
            resolveToken: () => ensureMcpChannelToken(vfs, process.env.ARXHUB_AI_WORKSPACE_MCP_TOKEN),
          },
        ],
        onPair: (key: string) => {
          pinnedFile.writeText(key).catch((error) => logger.error('Failed to persist pinned client key', error))
        },
      }))
      hub.plugins.register(VfsHttpServerPlugin, () => ({ vfs }))
      // Batched sync object store (client-encrypted blobs) under repo/.
      hub.plugins.register(SyncServerPlugin, () => ({ vfs: new ScopedFileSystem(vfs, 'repo') }))
      // Published (plaintext, world-readable) content under public/.
      hub.plugins.register(PublishServerPlugin, () => ({ vfs: new ScopedFileSystem(vfs, 'public') }))
      hub.plugins.register(BudgetServerPlugin, () => ({ fns: readFnsConfig(process.env) }))
      // Agent channel only where the vault is decrypted — desktop/dev stand, not headless-only server.
      hub.plugins.register(AiWorkspaceServerPlugin, () => ({ vfs }))
    },
  })

  await arxhub.start()
  return arxhub
}
