import type { Logger } from '@arxhub/core'
import { posix } from '@arxhub/path'
import { SETTINGS_TYPE_ID } from '@arxhub/plugin-settings'
import type { StoredWorkspace } from '@arxhub/plugin-shell'
import { renameEntry, type VirtualFileSystem } from '@arxhub/vfs'
import { DOCUMENTS_SETTINGS_SECTION } from './documents-config'
import { DOCUMENTS_TYPE_ID } from './documents-type'
import { manifest } from './manifest'

// What this plugin was called before it became Documents. A device that ran the old build still holds
// these names in its workspace record, its boot switches and its home folders; each is rewritten once.
export const LEGACY_TYPE_ID = 'arxhub.notes'
export const LEGACY_MANIFEST_NAME = 'Notes'
export const LEGACY_SETTINGS_SECTION = 'notes'

function renameKey<T>(record: Record<string, T>, from: string, to: string): Record<string, T> {
  if (!(from in record)) return record
  const { [from]: legacy, ...rest } = record
  // The new key can only have been written by a build that already reads it, so it is the newer one.
  return to in rest ? rest : { ...rest, [to]: legacy }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

// The workspace record, as the shell stores it on the device. Without this the old type id names a type
// nobody registers any more: the open documents, the expanded folders and the column width would be
// dropped on the first boot of the renamed build.
export function migrateWorkspaceRecord(record: StoredWorkspace): StoredWorkspace {
  const hasCurrent = record.types.some((type) => isRecord(type) && type.id === DOCUMENTS_TYPE_ID)
  const types = record.types.flatMap((type) => {
    if (!isRecord(type) || type.id !== LEGACY_TYPE_ID) return [type]
    return hasCurrent ? [] : [{ ...type, id: DOCUMENTS_TYPE_ID }]
  })
  const nav = renameKey(record.nav, LEGACY_TYPE_ID, DOCUMENTS_TYPE_ID)
  const settingsNav = nav[SETTINGS_TYPE_ID] === LEGACY_SETTINGS_SECTION ? { ...nav, [SETTINGS_TYPE_ID]: DOCUMENTS_SETTINGS_SECTION } : nav
  return {
    activeTypeId: record.activeTypeId === LEGACY_TYPE_ID ? DOCUMENTS_TYPE_ID : record.activeTypeId,
    types,
    nav: settingsNav,
    column: renameKey(record.column, LEGACY_TYPE_ID, DOCUMENTS_TYPE_ID),
  }
}

const BUCKETS = ['storage', 'state', 'temp'] as const

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false
  return true
}

// PluginVfs names a plugin's buckets by `manifest.name`, so renaming the manifest moved every bucket out
// from under the plugin — the synced settings most of all. Follows the repository's own move of
// `state/sync/repo` (plugins/repository/src/store-migration.ts), with one difference: here both folders
// existing is an ordinary state rather than a second boot, because a settings save can land in the new
// bucket while this move is still in flight, and sync can bring back the old one from a device that still
// runs the previous build. So a file already in the new bucket wins, the rest move over, and a colliding
// old file is left where it is rather than deleted — it may be the only copy of a change.
export async function migrateHomeFolders(root: VirtualFileSystem, logger: Logger): Promise<void> {
  for (const bucket of BUCKETS) {
    const from = posix.join(bucket, LEGACY_MANIFEST_NAME)
    const to = posix.join(bucket, manifest.name)
    if (!(await root.exists(from))) continue
    if (!(await root.exists(to))) {
      await renameEntry(root, from, to)
      logger.warn(`Moved '${from}' to '${to}'`)
      continue
    }
    // Listed before anything moves: a walk over a folder it is emptying is not a walk every backend keeps.
    const files: string[] = []
    for await (const file of root.walk(from)) files.push(file.pathname)
    const kept: string[] = []
    for (const pathname of files) {
      const target = posix.join(to, pathname.slice(from.length))
      if (!(await root.exists(target))) await renameEntry(root, pathname, target)
      // A twin with the same bytes is the copy half of a rename that was cut short (copy + delete on a
      // backend without native rename): dropping the old one loses nothing and lets the move finish.
      else if (sameBytes(await root.read(pathname), await root.read(target))) await root.delete(pathname, { force: true })
      else kept.push(pathname)
    }
    if (kept.length === 0) {
      await root.delete(from, { recursive: true, force: true })
      logger.warn(`Merged '${from}' into '${to}'`)
    } else {
      logger.warn(`Merged '${from}' into '${to}'; kept ${kept.length} file(s) that '${to}' already has: ${kept.join(', ')}`)
    }
  }
}
