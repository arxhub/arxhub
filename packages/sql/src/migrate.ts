import { CONTENT_SCHEMA_DDL, CONTENT_TABLES, INDEX_META_DDL, SCHEMA_VERSION_KEY, SQL_SCHEMA_VERSION } from './schema'
import type { SqlExecutor, SqlIndex } from './types'

// The version the index was written by, or null when there is none or it is not an integer. An
// unreadable version is treated as no version at all: whatever wrote it, we cannot tell what shape
// the tables have.
export async function readSchemaVersion(executor: SqlExecutor): Promise<number | null> {
  const { rows } = await executor.query<{ value: string }>('SELECT value FROM index_meta WHERE key = $1', [SCHEMA_VERSION_KEY])
  const raw = rows[0]?.value
  if (raw == null) return null
  const text = raw.trim()
  // Number.parseInt would read '1abc' as 1 — a value we cannot parse whole is a value we do not trust.
  return /^-?\d+$/.test(text) ? Number.parseInt(text, 10) : null
}

// Brings the index to SQL_SCHEMA_VERSION. Any version other than ours — older or newer — means the
// content tables are dropped and built again: the index is derived, so rebuilding it costs a walk of
// the content store, while reading a shape we do not know is not something we can do partially
// (FR-217).
export async function migrate(index: SqlIndex): Promise<void> {
  await index.exec(INDEX_META_DDL)

  const version = await readSchemaVersion(index)
  if (version === SQL_SCHEMA_VERSION) return

  await index.transaction(async (tx) => {
    await tx.exec(`DROP TABLE IF EXISTS ${CONTENT_TABLES.join(', ')} CASCADE`)
    for (const ddl of CONTENT_SCHEMA_DDL) {
      await tx.exec(ddl)
    }
    // The walk cursor and the scan timestamps describe an index that no longer exists — leaving them
    // behind would make the next walk resume past documents that were just dropped.
    await tx.query('DELETE FROM index_meta WHERE key <> $1', [SCHEMA_VERSION_KEY])
    // One row holds the version: two versions are never in the index at the same time.
    await tx.query('INSERT INTO index_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [
      SCHEMA_VERSION_KEY,
      String(SQL_SCHEMA_VERSION),
    ])
  })
}
