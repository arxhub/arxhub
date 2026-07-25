import { homedir } from 'node:os'
import { join } from 'node:path'
import { ArxHub } from '@arxhub/core'
import { illegalState } from '@arxhub/errors'
import GatewayServerPlugin from '@arxhub/plugin-gateway/server'
import { ProtectionServerPlugin } from '@arxhub/plugin-protection/server'
import { PUBLIC_READ_PATH, PublishServerPlugin } from '@arxhub/plugin-publish/server'
import { SyncServerPlugin } from '@arxhub/sync/server'
import { ScopedFileSystem } from '@arxhub/vfs'
import { VfsHttpServerPlugin } from '@arxhub/vfs-http/server'
import { NodeFileSystem } from '@arxhub/vfs-node'

// Local-only (never synced) home for the TOFU pin. Lives under state/, like the sync repo store.
const PINNED_KEY_FILE = 'state/protection/pinned-key'

function readPort(): number {
  const raw = process.env.ARXHUB_PORT
  if (raw == null || raw.trim() === '') return 3000
  const port = Number(raw)
  // A typo here would otherwise surface as a server listening on a port nobody expects.
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw illegalState(`ARXHUB_PORT must be an integer between 1 and 65535, got '${raw}'`)
  }
  return port
}

export async function createArxHub(): Promise<ArxHub> {
  const arxhub = new ArxHub()
  // The data root lives outside the artifact so updating the server never touches the vault.
  const dataDir = process.env.ARXHUB_DATA_DIR?.trim() || join(homedir(), '.arxhub')
  const vfs = new NodeFileSystem(dataDir, arxhub.logger)

  // Persist the TOFU pin across restarts. Without this, every restart comes up with no pin and
  // re-enters trust-on-first-use, so whoever reaches the server first could pin their own key. Load
  // any previously-pinned key here (BEFORE start, so no request can race the load) and treat it as a
  // fixed pin — once pinned, it's fixed. An explicit ARXHUB_SYNC_PUBKEY still wins.
  const pinnedFile = vfs.file(PINNED_KEY_FILE)
  const persistedPin = (await pinnedFile.exists()) ? (await pinnedFile.readText()).trim() || undefined : undefined
  const pinnedPublicKey = process.env.ARXHUB_SYNC_PUBKEY ?? persistedPin

  // Cross-origin clients: the Tauri desktop/mobile app and a separately-hosted web SPA call from a
  // different origin, so the guard must emit CORS headers or the browser/webview blocks every sync.
  // Signature auth carries no ambient credential (no cookies), so '*' is safe by default; set a
  // comma-separated ARXHUB_CORS_ORIGINS for a tighter allowlist.
  const corsOrigins: string[] | '*' = process.env.ARXHUB_CORS_ORIGINS
    ? process.env.ARXHUB_CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : '*'

  arxhub.plugins.register(GatewayServerPlugin, () => ({ port: readPort() }))
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
