import { existsSync } from 'node:fs'
import { rename } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { bootServer } from '@arxhub/boot/server'
import type { ArxHub } from '@arxhub/core'
import { BudgetServerPlugin, readFnsConfig } from '@arxhub/plugin-budget/server'
import GatewayServerPlugin from '@arxhub/plugin-gateway/server'
import { ProtectionServerPlugin } from '@arxhub/plugin-protection/server'
import { PUBLIC_READ_PATH, PublishServerPlugin } from '@arxhub/plugin-publish/server'
import { SyncServerPlugin } from '@arxhub/plugin-sync/server'
import { VfsHttpServerPlugin } from '@arxhub/plugin-vfs/server'
import { ScopedFileSystem } from '@arxhub/vfs'
import { ensureWritableDir, readDisabledPlugins, readMaintenance, readPort, refuseUnknownPlugins } from './read-env'

// Local-only (never synced) home for the TOFU pin. Lives under state/, like the sync repo store.
const PINNED_KEY_FILE = 'state/protection/pinned-key'

export async function createArxHub({ version }: { version: string }): Promise<ArxHub> {
  // Every switch is read and refused here, before anything is constructed: a value this process cannot
  // make sense of has to stop the boot while there is still nothing listening (FR-209).
  const disabled = readDisabledPlugins(process.env.ARXHUB_DISABLED_PLUGINS)
  const maintenance = readMaintenance(process.env.ARXHUB_MAINTENANCE)
  const port = readPort(process.env.ARXHUB_PORT)
  // The data root lives outside the artifact so updating the server never touches the vault.
  const dataDir = process.env.ARXHUB_DATA_DIR?.trim() || (await defaultDataDir())
  await ensureWritableDir(dataDir)

  const arxhub = await bootServer({
    dataDir,
    // The headless counterpart of the client's crash screen: there is nobody to click a button here, so
    // the same two switches come from the environment. Essential plugins (the gateway and the auth
    // guard) ignore both — a recovery boot must not be a way to expose an unprotected vault.
    disabled,
    maintenance,
    version,

    register: async (hub, { vfs, logger }) => {
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

      hub.plugins.register(GatewayServerPlugin, () => ({ port, version }))
      // Guard every route with signed-request auth. TOFU pins the first valid client key and, via
      // onPair, persists it so the next boot loads it above. GETs under the published-content prefix
      // are the ONE deliberate public hole (read-only, method-restricted).
      hub.plugins.register(ProtectionServerPlugin, () => ({
        pinnedPublicKey,
        publicGetPrefixes: [PUBLIC_READ_PATH],
        corsOrigins,
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
    },
  })

  // The roster exists only once the plugins are instantiated, so the misspelling is caught from start()'s
  // configure hook — after create()/configure(), still before anything listens.
  await arxhub.start(() =>
    refuseUnknownPlugins(
      disabled,
      arxhub.catalog.map((it) => it.name),
    ),
  )
  return arxhub
}

// 0.1.6 defaulted to `~/.arxhub`; the container always sets ARXHUB_DATA_DIR, so this only ever moves a
// store on a machine that ran the server bare. A second boot finds nothing at the old name.
async function defaultDataDir(): Promise<string> {
  const legacy = join(homedir(), '.arxhub')
  const current = join(homedir(), 'ArxHub')
  if (existsSync(legacy) && !existsSync(current)) await rename(legacy, current)
  return current
}
