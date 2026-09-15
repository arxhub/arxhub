import { hasErrorCode } from '@arxhub/errors'
import type { SqlExecutor, SqlIndex, SqlQueryResult, SqlReadOnlyLimits, SqlReadOnlyResult, SqlRow } from '@arxhub/sql'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SEARCH_SETTINGS, toSearchSettings } from '../search-config'
import { SEARCH_INDEX_UNAVAILABLE, SearchExtension } from '../search-extension'
import { silentLogger } from './fake-indexer'

// Records what each path handed the engine. Nothing here talks to PGlite: what is under test is the
// extension's contract — which path limits a query, which one refuses, and what reaches the engine.
class RecordingIndex implements SqlIndex {
  readonly dataDir = 'memory://test'
  readonly closed = false
  readonly queries: { sql: string; params: unknown[] | undefined }[] = []
  readonly readOnlyCalls: { sql: string; params: unknown[] | undefined; limits: SqlReadOnlyLimits | undefined }[] = []

  async query<R = SqlRow>(sql: string, params?: unknown[]): Promise<SqlQueryResult<R>> {
    this.queries.push({ sql, params })
    return { rows: [], fields: [] }
  }

  async exec(): Promise<void> {}

  async readOnly<R = SqlRow>(sql: string, params?: unknown[], limits?: SqlReadOnlyLimits): Promise<SqlReadOnlyResult<R>> {
    this.readOnlyCalls.push({ sql, params, limits })
    return { ok: true, rows: [], fields: [], rowCount: 0, truncated: false, durationMs: 1 }
  }

  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return fn(this)
  }

  async close(): Promise<void> {}
}

function extension(): SearchExtension {
  return new SearchExtension({ logger: silentLogger() })
}

describe('what a plugin gets when the index is not there', () => {
  it('rejects with a reason rather than answering with no rows (FR-238)', async () => {
    const search = extension()
    search.error.value = 'Could not open the search index at idb://arxhub-sql'
    search.status.value = 'failed'
    // What the plugin does once the open attempt has finished, either way.
    search.settled()

    await expect(search.query('SELECT 1')).rejects.toSatisfy((error: unknown) => hasErrorCode(error, 'SearchIndexUnavailableError'))
    await expect(search.query('SELECT 1')).rejects.toThrow(/Could not open the search index/)
  })

  it('waits out an index that is merely still opening instead of calling it unavailable (BE 2.1)', async () => {
    const search = extension()
    const index = new RecordingIndex()
    let settled = false

    const answer = search.query('SELECT path FROM document').then((result) => {
      // Proof the call did not resolve before the index arrived: it is the settle that let it through.
      expect(settled).toBe(true)
      return result
    })

    search.index = index
    search.status.value = 'ready'
    settled = true
    search.settled()

    await answer
    expect(index.queries).toHaveLength(1)
  })

  it('answers the console with a rejection VALUE, never a throw — a dead index is not a crash', async () => {
    const search = extension()
    search.status.value = 'failed'
    search.error.value = 'the index did not open'
    search.settled()

    const answer = await search.readOnly('SELECT 1')
    expect(answer.ok).toBe(false)
    if (answer.ok) return
    expect(answer.code).toBe(SEARCH_INDEX_UNAVAILABLE)
    expect(answer.message).toBe('the index did not open')
  })
})

describe('the plugin path', () => {
  it('passes values as parameters and never as query text', async () => {
    const search = extension()
    const index = new RecordingIndex()
    search.index = index
    search.settled()

    await search.query('SELECT path FROM document WHERE dir = $1', ["notes'; DROP TABLE document; --"])

    expect(index.queries[0].sql).toBe('SELECT path FROM document WHERE dir = $1')
    expect(index.queries[0].params).toEqual(["notes'; DROP TABLE document; --"])
  })

  it('carries no user limits: a plugin is part of the product, not user input', async () => {
    const search = extension()
    const index = new RecordingIndex()
    search.index = index
    search.settled()
    search.applySettings(toSearchSettings({ 'sql.maxRows': 10 }))

    await search.query('SELECT path FROM document')

    // The limited path is the other one — nothing about maxRows reaches here.
    expect(index.readOnlyCalls).toHaveLength(0)
    expect(index.queries).toHaveLength(1)
  })
})

describe('the console path', () => {
  it('runs under the limits the settings section saved, not the engine’s own defaults', async () => {
    const search = extension()
    const index = new RecordingIndex()
    search.index = index
    search.settled()
    search.applySettings(toSearchSettings({ 'sql.maxRows': 10, 'sql.timeoutMs': 200 }))

    await search.readOnly('SELECT path FROM document')

    expect(index.readOnlyCalls[0].limits).toEqual({ maxRows: 10, timeoutMs: 200 })
  })

  it('lets a caller override one limit without losing the configured other', async () => {
    const search = extension()
    const index = new RecordingIndex()
    search.index = index
    search.settled()
    search.applySettings(toSearchSettings({ 'sql.maxRows': 10, 'sql.timeoutMs': 200 }))

    await search.readOnly('SELECT 1', [], { maxRows: 3 })

    expect(index.readOnlyCalls[0].limits).toEqual({ maxRows: 3, timeoutMs: 200 })
  })

  it('keeps the configured limit when a caller passes the field as undefined', async () => {
    const search = extension()
    const index = new RecordingIndex()
    search.index = index
    search.settled()
    search.applySettings(toSearchSettings({ 'sql.maxRows': 10 }))

    await search.readOnly('SELECT 1', [], { maxRows: undefined })

    expect(index.readOnlyCalls[0].limits?.maxRows).toBe(10)
  })
})

describe('taking saved settings into use', () => {
  it('answers that a rebuild is due when the change alters what the index contains', () => {
    const search = extension()
    expect(search.applySettings(toSearchSettings({ 'index.exclude': ['archive/**'] }))).toBe(true)
    expect(search.settings.value.exclude).toEqual(['archive/**'])
  })

  it('answers that no rebuild is due for a value that only changes how the index is read', () => {
    const search = extension()
    expect(search.applySettings(toSearchSettings({ 'sql.maxRows': 10 }))).toBe(false)
    expect(search.settings.value.maxRows).toBe(10)
  })

  it('starts on the schema defaults, so a plugin asking before any file was read still gets sane limits', () => {
    expect(extension().settings.value).toEqual(DEFAULT_SEARCH_SETTINGS)
  })
})

// The prose half only. What the console draws — columns, types, keys, what points where — is read from
// the catalog of the live index, and is covered against a real one in @arxhub/sql.
describe('the schema notes the console hangs on what it read', () => {
  it('describes every table of the index, and every column it names', () => {
    const tables = extension().schema
    expect(tables.map((table) => table.name)).toEqual(['document', 'block', 'ref', 'tag', 'property', 'index_meta'])
    for (const table of tables) {
      expect(table.description).not.toBe('')
      expect(table.columns.length).toBeGreaterThan(0)
      for (const column of table.columns) {
        expect(column.description).not.toBe('')
      }
    }
  })
})
