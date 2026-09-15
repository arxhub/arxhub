import type { Logger } from '@arxhub/logger'
import { renameEntry, type VirtualFileSystem } from '@arxhub/vfs'

// PluginVfs scopes a plugin's state/ bucket to `state/<manifest.name>/` — before this plugin existed,
// the local repository lived inside the `sync` plugin's own bucket ('sync' is that plugin's actual
// manifest.name, lower-case). Now that the repository is its own essential plugin, its bucket is
// `state/Repository/repo`.
export const OLD_REPO_STORE_PATH = 'state/sync/repo'
export const REPO_STORE_PATH = 'state/Repository/repo'

// One-time: without this every existing device would lose its snapshots, chunks, checkout index and
// — worst — its last-synced rollback anchor, and re-enter trust-on-first-sync against the remote on
// its very next round. Runs as the first step of RepositoryExtension's preparation promise, before
// anything else touches the store. A second boot finds nothing left at the old path (or the new one
// already there) and does nothing.
export async function migrateRepositoryStore(rootVfs: VirtualFileSystem, logger: Logger): Promise<void> {
  if (!(await rootVfs.exists(OLD_REPO_STORE_PATH)) || (await rootVfs.exists(REPO_STORE_PATH))) return
  await renameEntry(rootVfs, OLD_REPO_STORE_PATH, REPO_STORE_PATH)
  logger.warn(`Moved the repository store from '${OLD_REPO_STORE_PATH}' to '${REPO_STORE_PATH}'`)
}
