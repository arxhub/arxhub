import { hasErrorCode } from '@arxhub/errors'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { migrate, readSchemaVersion } from '../migrate'
import { openSqlIndex } from '../pglite-index'
import { SCHEMA_VERSION_KEY, SQL_SCHEMA_VERSION } from '../schema'
import { SQL_REJECTION, type SqlIndex } from '../types'

// A cold PGlite costs about a second, so the whole file shares one index and each test puts the
// content tables back the way it found them.
let index: SqlIndex

async function insertDocuments(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await index.query(
      `INSERT INTO document (path, name, dir, ext, kind, title, title_fold, content, size, mtime, ctime)
       VALUES ($1, $2, '', 'md', 'markdown', $3, $4, $5, 0, 0, 0)`,
      [`note-${i}.md`, `note-${i}.md`, `Note ${i}`, `note ${i}`, `body of note ${i}`],
    )
  }
}

async function countDocuments(): Promise<number> {
  const { rows } = await index.query<{ count: number }>('SELECT count(*)::int AS count FROM document')
  return rows[0].count
}

beforeAll(async () => {
  index = await openSqlIndex({ dataDir: 'memory://' })
})

afterAll(async () => {
  await index.close()
})

beforeEach(async () => {
  await index.exec('DELETE FROM document')
})

describe('openSqlIndex', () => {
  it('needs a dataDir', async () => {
    await expect(openSqlIndex({ dataDir: '   ' })).rejects.toSatisfy((error: unknown) => hasErrorCode(error, 'ValidationError'))
  })

  it('creates the whole schema and records the version it wrote', async () => {
    const { rows } = await index.query<{ schema_version: string | null; tables: number }>(
      `SELECT (SELECT value FROM index_meta WHERE key = '${SCHEMA_VERSION_KEY}') AS schema_version,
              (SELECT count(*)::int FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name IN ('document', 'block', 'ref', 'tag')) AS tables`,
    )
    expect(rows[0].tables).toBe(4)
    expect(rows[0].schema_version).toBe(String(SQL_SCHEMA_VERSION))
    expect(await readSchemaVersion(index)).toBe(SQL_SCHEMA_VERSION)
  })

  it('installs pg_trgm and unaccent', async () => {
    const { rows } = await index.query<{ extname: string }>(
      "SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'unaccent') ORDER BY extname",
    )
    expect(rows.map((row) => row.extname)).toEqual(['pg_trgm', 'unaccent'])
  })

  it('names the type of every result field', async () => {
    const { fields } = await index.query('SELECT path, size, indexed_at FROM document')
    expect(fields.map((field) => [field.name, field.type])).toEqual([
      ['path', 'text'],
      ['size', 'int8'],
      ['indexed_at', 'timestamptz'],
    ])
  })
})

describe('migrate', () => {
  it('does nothing when the index is already at the current version', async () => {
    await insertDocuments(1)
    await migrate(index)
    expect(await countDocuments()).toBe(1)
  })

  it('discards an index written by an older schema', async () => {
    await insertDocuments(1)
    await index.query('UPDATE index_meta SET value = $1 WHERE key = $2', [String(SQL_SCHEMA_VERSION - 1), SCHEMA_VERSION_KEY])

    await migrate(index)

    expect(await countDocuments()).toBe(0)
    expect(await readSchemaVersion(index)).toBe(SQL_SCHEMA_VERSION)
  })

  it('discards an index written by a newer schema', async () => {
    await insertDocuments(1)
    await index.query('UPDATE index_meta SET value = $1 WHERE key = $2', [String(SQL_SCHEMA_VERSION + 1), SCHEMA_VERSION_KEY])

    await migrate(index)

    expect(await countDocuments()).toBe(0)
    expect(await readSchemaVersion(index)).toBe(SQL_SCHEMA_VERSION)
  })

  it('discards an index whose version is not an integer', async () => {
    await insertDocuments(1)
    await index.query('UPDATE index_meta SET value = $1 WHERE key = $2', ['1abc', SCHEMA_VERSION_KEY])
    expect(await readSchemaVersion(index)).toBeNull()

    await migrate(index)

    expect(await countDocuments()).toBe(0)
    expect(await readSchemaVersion(index)).toBe(SQL_SCHEMA_VERSION)
  })

  it('keeps one row for the version and drops the state of the walk it discarded', async () => {
    await index.query('INSERT INTO index_meta (key, value) VALUES ($1, $2)', ['scan_cursor', 'notes/a.md'])
    await index.query('UPDATE index_meta SET value = $1 WHERE key = $2', [String(SQL_SCHEMA_VERSION + 1), SCHEMA_VERSION_KEY])

    await migrate(index)

    const { rows } = await index.query<{ key: string; value: string }>('SELECT key, value FROM index_meta ORDER BY key')
    expect(rows).toEqual([{ key: SCHEMA_VERSION_KEY, value: String(SQL_SCHEMA_VERSION) }])
  })
})

describe('readOnly', () => {
  it('runs a select and reports its fields', async () => {
    await insertDocuments(2)

    const result = await index.readOnly<{ path: string }>('SELECT path FROM document ORDER BY path')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows.map((row) => row.path)).toEqual(['note-0.md', 'note-1.md'])
    expect(result.fields).toEqual([{ name: 'path', dataTypeId: 25, type: 'text' }])
    expect(result.rowCount).toBe(2)
    expect(result.truncated).toBe(false)
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('binds parameters instead of pasting them into the query', async () => {
    await insertDocuments(2)

    const result = await index.readOnly<{ path: string }>('SELECT path FROM document WHERE path = $1', ['note-1.md'])

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toEqual([{ path: 'note-1.md' }])
  })

  it('refuses a write and leaves the data alone', async () => {
    await insertDocuments(3)

    const result = await index.readOnly('DELETE FROM document')

    expect(result.ok).toBe(false)
    if (result.ok) return
    // 25006 — read_only_sql_transaction. The DBMS refused, not a parser over the query text.
    expect(result.code).toBe('25006')
    expect(result.message).toMatch(/read-only transaction/i)
    expect(await countDocuments()).toBe(3)
  })

  it('refuses an update and a schema change just as well', async () => {
    await insertDocuments(1)

    const update = await index.readOnly("UPDATE document SET title = 'changed'")
    const ddl = await index.readOnly('DROP TABLE document')

    expect(update.ok).toBe(false)
    expect(ddl.ok).toBe(false)
    const { rows } = await index.query<{ title: string }>('SELECT title FROM document')
    expect(rows).toEqual([{ title: 'Note 0' }])
  })

  it('rolls back after a failed query so the next one works', async () => {
    await insertDocuments(1)

    const failed = await index.readOnly('SELECT * FROM no_such_table')
    expect(failed.ok).toBe(false)

    const next = await index.readOnly('SELECT path FROM document')
    expect(next.ok).toBe(true)
    if (!next.ok) return
    expect(next.rowCount).toBe(1)
  })

  it('reports where the DBMS choked on the query text', async () => {
    const result = await index.readOnly('SELECT * FROM no_such_table')

    expect(result.ok).toBe(false)
    if (result.ok) return
    // 42P01 — undefined_table.
    expect(result.code).toBe('42P01')
    expect(result.position).toBeGreaterThan(0)
  })

  it('truncates the result at maxRows and says so', async () => {
    await insertDocuments(30)

    const result = await index.readOnly('SELECT path FROM document ORDER BY path', [], { maxRows: 10 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toHaveLength(10)
    expect(result.rowCount).toBe(10)
    expect(result.truncated).toBe(true)
  })

  it('does not report truncation when everything fits', async () => {
    await insertDocuments(3)

    const result = await index.readOnly('SELECT path FROM document', [], { maxRows: 3 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.truncated).toBe(false)
  })

  // What can be asserted here is that the limit reaches the DBMS. Whether it fires is PGlite's:
  // 0.5.4 never delivers the timer interrupt, so a long query runs to completion — see the note in
  // pglite-index.ts.
  it('arms the requested statement timeout on the transaction', async () => {
    const result = await index.readOnly<{ timeout: string }>("SELECT current_setting('statement_timeout') AS timeout", [], {
      timeoutMs: 100,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0].timeout).toBe('100ms')
  })

  it('arms the default timeout when none is asked for', async () => {
    const result = await index.readOnly<{ timeout: string }>("SELECT current_setting('statement_timeout') AS timeout")

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows[0].timeout).toBe('5s')
  })

  it('leaves the timeout behind with the transaction', async () => {
    await index.readOnly("SELECT current_setting('statement_timeout')", [], { timeoutMs: 100 })

    const { rows } = await index.query<{ timeout: string }>("SELECT current_setting('statement_timeout') AS timeout")
    expect(rows[0].timeout).toBe('0')
  })

  it('refuses a query made of several statements before the DBMS sees it', async () => {
    await insertDocuments(2)

    const result = await index.readOnly('SELECT path FROM document; DELETE FROM document')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe(SQL_REJECTION.MULTIPLE_STATEMENTS)
    expect(result.durationMs).toBe(0)
    expect(await countDocuments()).toBe(2)
  })

  it('refuses an empty query', async () => {
    const result = await index.readOnly('   ')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.code).toBe(SQL_REJECTION.EMPTY_STATEMENT)
  })

  it('does not read a semicolon inside a string literal as a separator', async () => {
    const result = await index.readOnly<{ text: string }>("SELECT 'a;b' AS text")

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.rows).toEqual([{ text: 'a;b' }])
  })

  it('takes a trailing semicolon', async () => {
    const result = await index.readOnly('SELECT 1 AS one;')

    expect(result.ok).toBe(true)
  })
})

describe('query', () => {
  it('writes, because the plugin path is not user input', async () => {
    await insertDocuments(1)
    await index.query('DELETE FROM document')
    expect(await countDocuments()).toBe(0)
  })

  it('is not limited to maxRows', async () => {
    await insertDocuments(30)
    const { rows } = await index.query('SELECT path FROM document')
    expect(rows).toHaveLength(30)
  })
})

describe('transaction', () => {
  it('resolves with what the callback returned', async () => {
    const written = await index.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO document (path, name, dir, ext, kind, title, title_fold, content, size, mtime, ctime)
         VALUES ('a.md', 'a.md', '', 'md', 'markdown', 'A', 'a', '', 0, 0, 0)`,
      )
      const { rows } = await tx.query<{ count: number }>('SELECT count(*)::int AS count FROM document')
      return rows[0].count
    })

    expect(written).toBe(1)
  })

  it('undoes everything when the callback fails', async () => {
    await expect(
      index.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO document (path, name, dir, ext, kind, title, title_fold, content, size, mtime, ctime)
           VALUES ('a.md', 'a.md', '', 'md', 'markdown', 'A', 'a', '', 0, 0, 0)`,
        )
        await tx.query('SELECT * FROM no_such_table')
      }),
    ).rejects.toThrow()

    expect(await countDocuments()).toBe(0)
  })
})

describe('the schema itself', () => {
  it('drops a document’s blocks, tags and links with it', async () => {
    await insertDocuments(1)
    await index.query("INSERT INTO block (id, doc_path, ordinal, type, content) VALUES ('note-0.md#0', 'note-0.md', 0, 'paragraph', 'text')")
    await index.query("INSERT INTO tag (doc_path, block_id, name, name_fold) VALUES ('note-0.md', NULL, 'Idea', 'idea')")
    await index.query("INSERT INTO ref (src_path, target_raw, target_path, kind) VALUES ('note-0.md', 'other', NULL, 'wikilink')")

    await index.query('DELETE FROM document')

    const { rows } = await index.query<{ blocks: number; tags: number; refs: number }>(
      `SELECT (SELECT count(*)::int FROM block) AS blocks,
              (SELECT count(*)::int FROM tag) AS tags,
              (SELECT count(*)::int FROM ref) AS refs`,
    )
    expect(rows[0]).toEqual({ blocks: 0, tags: 0, refs: 0 })
  })

  it('gives the title more weight than the content', async () => {
    await index.query(
      `INSERT INTO document (path, name, dir, ext, kind, title, title_fold, content, size, mtime, ctime)
       VALUES ('t.md', 't.md', '', 'md', 'markdown', 'kayak', 'kayak', 'a body about boats', 0, 0, 0)`,
    )

    const { rows } = await index.query<{ tsv: string }>('SELECT tsv::text AS tsv FROM document')
    expect(rows[0].tsv).toContain("'kayak':1A")
    expect(rows[0].tsv).toContain('B')
  })

  it('refuses the same document-level tag twice', async () => {
    await insertDocuments(1)
    await index.query("INSERT INTO tag (doc_path, block_id, name, name_fold) VALUES ('note-0.md', NULL, 'Idea', 'idea')")

    await expect(
      index.query("INSERT INTO tag (doc_path, block_id, name, name_fold) VALUES ('note-0.md', NULL, 'idea', 'idea')"),
    ).rejects.toThrow()
  })
})

describe('close', () => {
  it('can be called twice and refuses queries afterwards', async () => {
    const closing = await openSqlIndex({ dataDir: 'memory://' })

    await closing.close()
    await closing.close()

    expect(closing.closed).toBe(true)
    await expect(closing.query('SELECT 1')).rejects.toSatisfy((error: unknown) => hasErrorCode(error, 'SqlIndexClosedError'))
  })
})
