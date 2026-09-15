import type { Logger } from '@arxhub/core'
import { type BaseDirectory, exists, rename } from '@tauri-apps/plugin-fs'

// One-time. 0.1.6 kept the desktop store in a dotfolder and 0.1.7 moved it to a visible one with no
// code to carry the data across, so an update over 0.1.6 came up with an empty vault while every note
// still sat under the old name. Runs before the store is opened; a later boot finds the old folder
// gone (or the new one already there) and does nothing — the same guard as the repository store's
// own move in `plugins/repository/src/store-migration.ts`.
export async function relocateLegacyStore(from: string, to: string, baseDir: BaseDirectory, logger: Logger): Promise<boolean> {
  if (!(await exists(from, { baseDir })) || (await exists(to, { baseDir }))) return false
  await rename(from, to, { oldPathBaseDir: baseDir, newPathBaseDir: baseDir })
  logger.warn(`Moved the store from '${from}' to '${to}'`)
  return true
}
