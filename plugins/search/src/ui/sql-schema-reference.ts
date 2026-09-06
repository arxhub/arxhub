import {
  SCHEMA_REFERENCE_MAX_ROWS,
  SCHEMA_REFERENCE_SQL,
  type SqlSchemaReferenceRow,
  type SqlSchemaReferenceTable,
  toSchemaReference,
} from '@arxhub/sql'
import type { SearchExtension } from '../search-extension'

export type SchemaReferenceLoad = { ok: true; tables: SqlSchemaReferenceTable[] } | { ok: false; message: string }

// Module scope, not the component's: the section is unmounted whenever it is folded away, and the shape of
// the index does not change while the app is up — a rebuild writes the same DDL back. So the answer
// survives the toggle instead of being asked again on every opening.
let cached: SqlSchemaReferenceTable[] | null = null

// Asks the index what it is made of, through the same read-only path a typed query takes — a reference
// must not be a way around the transaction everything else in the console runs inside.
export async function loadSchemaReference(search: SearchExtension): Promise<SchemaReferenceLoad> {
  if (cached != null) return { ok: true, tables: cached }
  // The reference's own row limit rather than the owner's: a small sql.maxRows would cut the schema off
  // mid-table, and a table missing its last columns reads as the whole of it.
  const answer = await search.readOnly<SqlSchemaReferenceRow>(SCHEMA_REFERENCE_SQL, [], { maxRows: SCHEMA_REFERENCE_MAX_ROWS })
  // Not cached: a failure is the one outcome worth trying again on the next opening.
  if (!answer.ok) return { ok: false, message: answer.message }
  cached = toSchemaReference(answer.rows)
  return { ok: true, tables: cached }
}
