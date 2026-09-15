import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openSqlIndex } from '../pglite-index'
import { SCHEMA_TABLES } from '../schema'
import {
  SCHEMA_REFERENCE_MAX_ROWS,
  SCHEMA_REFERENCE_SQL,
  type SqlSchemaReferenceRow,
  type SqlSchemaReferenceTable,
  toSchemaReference,
} from '../schema-reference'
import type { SqlIndex } from '../types'

let index: SqlIndex
let reference: SqlSchemaReferenceTable[]

function table(name: string): SqlSchemaReferenceTable {
  const found = reference.find((entry) => entry.name === name)
  if (found == null) throw new Error(`no ${name} in the reference`)
  return found
}

function column(tableName: string, columnName: string) {
  const found = table(tableName).columns.find((entry) => entry.name === columnName)
  if (found == null) throw new Error(`no ${tableName}.${columnName} in the reference`)
  return found
}

beforeAll(async () => {
  index = await openSqlIndex({ dataDir: 'memory://' })
  // Through the same read-only path the console uses, so the reference is proven to be answerable by a
  // query the user could have typed — not by a privileged one.
  const answer = await index.readOnly<SqlSchemaReferenceRow>(SCHEMA_REFERENCE_SQL, [], { maxRows: SCHEMA_REFERENCE_MAX_ROWS })
  if (!answer.ok) throw new Error(answer.message)
  expect(answer.truncated).toBe(false)
  reference = toSchemaReference(answer.rows)
})

afterAll(async () => {
  await index.close()
})

describe('the schema reference read from the live index', () => {
  it('lists every table of the index, the described ones first', () => {
    expect(reference.map((entry) => entry.name)).toEqual(['document', 'block', 'ref', 'tag', 'property', 'index_meta'])
  })

  it('keeps the columns in the order the table declares them', () => {
    expect(table('index_meta').columns.map((entry) => entry.name)).toEqual(['key', 'value'])
    expect(table('document').columns[0].name).toBe('path')
  })

  it('reads the type the DBMS reports rather than one written down beside the DDL', () => {
    expect(column('document', 'path').type).toBe('text')
    expect(column('document', 'size').type).toBe('bigint')
    expect(column('document', 'frontmatter').type).toBe('jsonb')
    expect(column('document', 'tsv').type).toBe('tsvector')
    expect(column('document', 'indexed_at').type).toBe('timestamp with time zone')
  })

  it('marks a primary key, a nullable column and a generated one', () => {
    expect(column('document', 'path')).toMatchObject({ primaryKey: true, nullable: false })
    expect(column('document', 'hash')).toMatchObject({ primaryKey: false, nullable: true })
    expect(column('document', 'tsv').generated).toBe(true)
    expect(column('document', 'title').generated).toBe(false)
  })

  it('says what a column points at, which is what a join is written from', () => {
    expect(column('block', 'doc_path').references).toBe('document.path')
    expect(column('tag', 'doc_path').references).toBe('document.path')
    expect(column('ref', 'src_path').references).toBe('document.path')
    // A path written into a row, not a constraint: the reference must not invent one.
    expect(column('ref', 'target_path').references).toBeNull()
  })

  it('shows the column a hand-written list had lost', () => {
    expect(column('block', 'checked')).toMatchObject({ type: 'boolean', nullable: true })
  })

  // The guard on the prose half: a column added to the DDL without a note shows up here as an empty
  // description, which is the drift the reference exists to make impossible to miss.
  it('has a note for every column the index actually has', () => {
    const missing = reference.flatMap((entry) =>
      entry.columns.filter((col) => col.description === '').map((col) => `${entry.name}.${col.name}`),
    )
    expect(missing).toEqual([])
  })

  it('describes no table or column the index does not have', () => {
    const stale = SCHEMA_TABLES.flatMap((note) => {
      const live = reference.find((entry) => entry.name === note.name)
      if (live == null) return [note.name]
      return note.columns.filter((col) => !live.columns.some((entry) => entry.name === col.name)).map((col) => `${note.name}.${col.name}`)
    })
    expect(stale).toEqual([])
  })
})

describe('toSchemaReference', () => {
  const row = (overrides: Partial<SqlSchemaReferenceRow>): SqlSchemaReferenceRow => ({
    table_name: 'document',
    ordinal: 1,
    column_name: 'path',
    type: 'text',
    not_null: true,
    generated: false,
    primary_key: true,
    references_to: null,
    ...overrides,
  })

  it('orders columns by their ordinal, whatever order the rows arrive in', () => {
    const built = toSchemaReference([row({ column_name: 'name', ordinal: 2 }), row({ column_name: 'path', ordinal: 1 })])
    expect(built[0].columns.map((entry) => entry.name)).toEqual(['path', 'name'])
  })

  it('shows a table nobody described, after the described ones and with no description', () => {
    const built = toSchemaReference([row({}), row({ table_name: 'kv', column_name: 'k', ordinal: 1 })])
    expect(built.map((entry) => entry.name)).toEqual(['document', 'kv'])
    expect(built[1].description).toBe('')
  })

  it('leaves a column with no note empty rather than dropping it', () => {
    const built = toSchemaReference([row({ column_name: 'invented', ordinal: 9 })])
    expect(built[0].columns).toEqual([
      { name: 'invented', type: 'text', nullable: false, primaryKey: true, generated: false, references: null, description: '' },
    ])
  })
})
