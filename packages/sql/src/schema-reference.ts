import { SCHEMA_TABLES, type SqlSchemaTable } from './schema'

// One column of the index as the DBMS itself describes it, plus the note we keep for it.
export interface SqlSchemaReferenceColumn {
  name: string
  // As `format_type` writes it — `text`, `bigint`, `timestamp with time zone`, `tsvector`.
  type: string
  nullable: boolean
  primaryKey: boolean
  // A generated column cannot be written and is derived from the row it sits in (the tsvectors).
  generated: boolean
  // `<table>.<column>` this column points at, or null when it points at nothing.
  references: string | null
  // Empty when the DDL has a column no note describes — shown as missing rather than hidden, so the
  // gap is visible instead of silently absent.
  description: string
}

export interface SqlSchemaReferenceTable {
  name: string
  description: string
  columns: SqlSchemaReferenceColumn[]
}

// A row of SCHEMA_REFERENCE_SQL, one per column.
export interface SqlSchemaReferenceRow {
  table_name: string
  ordinal: number
  column_name: string
  type: string
  not_null: boolean
  generated: boolean
  primary_key: boolean
  references_to: string | null
}

// Asked of the catalog rather than derived from CONTENT_SCHEMA_DDL by hand: a reference the console
// shows while a query is being written has to be the schema that is actually there, and a second
// description of it in prose drifts the moment a column is added (the hand-written list had already
// lost `block.checked`).
//
// One statement, because the user path takes exactly one — it runs through the same READ ONLY
// transaction as everything else typed into the console, so a reference cannot be a way around it.
// `references_to`, not `references`: the word is reserved and cannot be a bare alias.
export const SCHEMA_REFERENCE_SQL = `
SELECT c.relname AS table_name,
       a.attnum AS ordinal,
       a.attname AS column_name,
       format_type(a.atttypid, a.atttypmod) AS type,
       a.attnotnull AS not_null,
       a.attgenerated <> '' AS generated,
       coalesce(pk.is_key, false) AS primary_key,
       fk.target AS references_to
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
LEFT JOIN LATERAL (
  SELECT true AS is_key
  FROM pg_index i
  WHERE i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY (i.indkey)
  LIMIT 1
) pk ON true
LEFT JOIN LATERAL (
  SELECT ft.relname || '.' || fa.attname AS target
  FROM pg_constraint k
  JOIN pg_class ft ON ft.oid = k.confrelid
  JOIN pg_attribute fa ON fa.attrelid = k.confrelid AND fa.attnum = k.confkey[1]
  WHERE k.conrelid = c.oid AND k.contype = 'f' AND k.conkey[1] = a.attnum AND array_length(k.conkey, 1) = 1
  LIMIT 1
) fk ON true
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname, a.attnum
`.trim()

// The reference is not a user query and is not bound by the row limit the owner set for one: a small
// `sql.maxRows` would otherwise cut the schema off mid-table and read as the whole of it.
export const SCHEMA_REFERENCE_MAX_ROWS = 1000

// Groups the catalog rows into tables and hangs each note on the column it belongs to. Pure: the DDL
// half is a query, and everything after it is a value the interface renders.
export function toSchemaReference(
  rows: readonly SqlSchemaReferenceRow[],
  notes: readonly SqlSchemaTable[] = SCHEMA_TABLES,
): SqlSchemaReferenceTable[] {
  const tables = new Map<string, SqlSchemaReferenceTable>()
  for (const row of [...rows].sort((a, b) => a.ordinal - b.ordinal)) {
    const note = notes.find((table) => table.name === row.table_name)
    let table = tables.get(row.table_name)
    if (table == null) {
      table = { name: row.table_name, description: note?.description ?? '', columns: [] }
      tables.set(row.table_name, table)
    }
    table.columns.push({
      name: row.column_name,
      type: row.type,
      nullable: !row.not_null,
      primaryKey: row.primary_key,
      generated: row.generated,
      references: row.references_to,
      description: note?.columns.find((column) => column.name === row.column_name)?.description ?? '',
    })
  }

  // The notes' own order is the order a reader wants — `document` first, the tables that hang off it
  // after — and alphabetical (what the query returns) would open on `block`. A table nobody described
  // still shows, at the end, rather than being dropped for having no note.
  const described = notes.map((note) => tables.get(note.name)).filter((table): table is SqlSchemaReferenceTable => table != null)
  const rest = [...tables.values()].filter((table) => !notes.some((note) => note.name === table.name))
  return [...described, ...rest.sort((a, b) => a.name.localeCompare(b.name))]
}
