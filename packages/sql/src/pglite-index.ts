import { validation } from '@arxhub/errors'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import { sqlIndexClosed, sqlIndexOpen } from './errors'
import { migrate } from './migrate'
import { splitStatements } from './statements'
import {
  DEFAULT_MAX_ROWS,
  DEFAULT_TIMEOUT_MS,
  type OpenSqlIndexOptions,
  SQL_REJECTION,
  type SqlExecutor,
  type SqlField,
  type SqlIndex,
  type SqlQueryResult,
  type SqlReadOnlyLimits,
  type SqlReadOnlyResult,
  type SqlRow,
} from './types'

// What PGlite reports for the columns of a result set. Only the OID travels on the wire — the type
// name is ours to resolve.
type PgliteFields = readonly { name: string; dataTypeID: number }[]

// The slice of PGlite an executor needs: the same shape on the connection and inside a transaction.
interface PgliteQueryable {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; fields: PgliteFields }>
  exec(sql: string): Promise<unknown>
}

// Opens the index and brings its schema to the current version. pg_trgm and unaccent are always
// installed — fuzzy title matching and diacritic folding are part of what search means here, not
// something an instance opts into.
export async function openSqlIndex(options: OpenSqlIndexOptions): Promise<SqlIndex> {
  const dataDir = typeof options.dataDir === 'string' ? options.dataDir.trim() : ''
  if (dataDir.length === 0) {
    throw validation('A SQL index needs a dataDir: "memory://" for an index that is not kept, "idb://<name>" in the browser.')
  }

  let db: PGlite
  try {
    db = await PGlite.create({ dataDir, extensions: { pg_trgm, unaccent } })
  } catch (error) {
    throw sqlIndexOpen(dataDir, error)
  }

  try {
    await db.exec('CREATE EXTENSION IF NOT EXISTS pg_trgm')
    await db.exec('CREATE EXTENSION IF NOT EXISTS unaccent')
    const index = new PgliteSqlIndex(dataDir, db, await readTypeNames(db))
    await migrate(index)
    return index
  } catch (error) {
    // A half-open index is a live WASM instance and, in the browser, an open IndexedDB handle —
    // leaving it behind would keep the storage locked against the next attempt.
    await db.close().catch(() => undefined)
    throw sqlIndexOpen(dataDir, error)
  }
}

// oid -> type name, read once when the index opens. Resolving it lazily would mean a query inside the
// READ ONLY transaction could need a query of its own, and the console asks for type names on every
// result it shows.
async function readTypeNames(db: PgliteQueryable): Promise<Map<number, string>> {
  const { rows } = await db.query<{ oid: unknown; typname: string }>('SELECT oid, typname FROM pg_type')
  return new Map(rows.map((row) => [Number(row.oid), row.typname]))
}

class PgliteExecutor implements SqlExecutor {
  protected readonly db: PgliteQueryable
  protected readonly typeNames: Map<number, string>

  constructor(db: PgliteQueryable, typeNames: Map<number, string>) {
    this.db = db
    this.typeNames = typeNames
  }

  async query<R = SqlRow>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<R>> {
    const result = await this.db.query<R>(sql, params)
    return { rows: result.rows, fields: this.mapFields(result.fields) }
  }

  async exec(sql: string): Promise<void> {
    await this.db.exec(sql)
  }

  protected mapFields(fields: PgliteFields): SqlField[] {
    return fields.map((field) => ({
      name: field.name,
      dataTypeId: field.dataTypeID,
      type: this.typeNames.get(field.dataTypeID) ?? `oid:${field.dataTypeID}`,
    }))
  }
}

class PgliteSqlIndex extends PgliteExecutor implements SqlIndex {
  readonly dataDir: string
  private readonly pglite: PGlite
  private isClosed = false
  // Queue over ALL access to the connection. PGlite holds a single connection, and readOnly() keeps a
  // multi-step transaction open on it (BEGIN → SET TRANSACTION READ ONLY → query → COMMIT). A write
  // that lands in that window runs INSIDE the read-only transaction and dies with 25006 — "cannot
  // execute INSERT in a read-only transaction". From the outside this looked like the indexer losing
  // whichever file it was writing exactly while someone ran a console query, leaving that file in the
  // index with no text and no title, permanently (readDocumentState still saw a row, so it never
  // retried — see the indexer's own unparsed-row fix). The queue only forbids interleaving; PGlite is
  // single-threaded regardless, so it costs no throughput.
  private tail: Promise<unknown> = Promise.resolve()

  constructor(dataDir: string, db: PGlite, typeNames: Map<number, string>) {
    super(db, typeNames)
    this.dataDir = dataDir
    this.pglite = db
  }

  get closed(): boolean {
    return this.isClosed
  }

  override async query<R = SqlRow>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<R>> {
    this.assertOpen()
    return this.serialize(() => super.query<R>(sql, params))
  }

  override async exec(sql: string): Promise<void> {
    this.assertOpen()
    return this.serialize(() => super.exec(sql))
  }

  // Queues the given work behind everything already queued. A rejection doesn't wedge the queue — the
  // next caller still gets its own turn, or one failed statement would hang the index until restart.
  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work, work)
    this.tail = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  async readOnly<R = SqlRow>(sql: string, params: unknown[] = [], limits: SqlReadOnlyLimits = {}): Promise<SqlReadOnlyResult<R>> {
    this.assertOpen()
    return this.serialize(() => this.runReadOnly<R>(sql, params, limits))
  }

  private async runReadOnly<R = SqlRow>(sql: string, params: unknown[], limits: SqlReadOnlyLimits): Promise<SqlReadOnlyResult<R>> {
    const maxRows = positiveInteger(limits.maxRows, DEFAULT_MAX_ROWS)
    const timeoutMs = positiveInteger(limits.timeoutMs, DEFAULT_TIMEOUT_MS)

    const statements = splitStatements(sql)
    if (statements.length === 0) {
      return { ok: false, message: 'The query is empty.', code: SQL_REJECTION.EMPTY_STATEMENT, position: null, durationMs: 0 }
    }
    if (statements.length > 1) {
      return {
        ok: false,
        message: `A query must be a single statement — this one has ${statements.length}.`,
        code: SQL_REJECTION.MULTIPLE_STATEMENTS,
        position: null,
        durationMs: 0,
      }
    }

    const started = performance.now()
    try {
      await this.pglite.exec('BEGIN')
      // The DBMS refuses the write, not a parser over the query text: no parser closes every way to
      // write — a function, a CTE, DDL — and the point is that a user query cannot change the index.
      // SET TRANSACTION has to run before any query in the transaction.
      await this.pglite.exec('SET TRANSACTION READ ONLY')
      // set_config rather than `SET LOCAL statement_timeout = …`: SET takes no bind parameters, and
      // pasting a value into SQL text is the habit this whole path exists to avoid.
      //
      // Known PGlite limitation (0.5.4): the setting is applied and readable, but the timeout never
      // fires — Postgres arms it with setitimer/SIGALRM, and the WASM build gets no signals. A JS-side
      // deadline is no help either: the query holds the single thread, so no timer runs until it is
      // done. Setting it anyway is what makes a long query bounded the day PGlite delivers the
      // interrupt; until then durationMs is the only thing that reports the cost.
      await this.pglite.query('SELECT set_config($1, $2, true)', ['statement_timeout', String(timeoutMs)])

      const result = await this.pglite.query<R>(statements[0], params)
      await this.pglite.exec('COMMIT')

      const truncated = result.rows.length > maxRows
      const rows = truncated ? result.rows.slice(0, maxRows) : result.rows
      return {
        ok: true,
        rows,
        fields: this.mapFields(result.fields),
        rowCount: rows.length,
        truncated,
        durationMs: performance.now() - started,
      }
    } catch (error) {
      // Without the rollback the connection stays in a failed transaction and every following query
      // dies with 25P02 — the console would be dead until the app restarts.
      await this.rollbackQuietly()
      return { ...describeDbError(error), durationMs: performance.now() - started }
    }
  }

  async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    this.assertOpen()
    return this.serialize(() => this.runTransaction(fn))
  }

  private async runTransaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    // PGlite's transaction() resolves with what the callback returned, but T is only known here —
    // carrying the value out through an array keeps the generic exact without a cast.
    const captured: T[] = []
    await this.pglite.transaction(async (tx) => {
      captured.push(await fn(new PgliteExecutor(tx, this.typeNames)))
    })
    return captured[0]
  }

  async close(): Promise<void> {
    if (this.isClosed) return
    this.isClosed = true
    await this.pglite.close()
  }

  private async rollbackQuietly(): Promise<void> {
    try {
      await this.pglite.exec('ROLLBACK')
    } catch {
      // A rollback that fails means the connection itself is gone. The query failure is the one worth
      // reporting, and this one would only mask it.
    }
  }

  private assertOpen(): void {
    if (this.isClosed) throw sqlIndexClosed(this.dataDir)
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  const rounded = Math.trunc(value)
  return rounded > 0 ? rounded : fallback
}

// Turns whatever the DBMS threw into the rejection the console shows: its message, its SQLSTATE and
// the offset into the query text, when it gave them.
function describeDbError(error: unknown): { ok: false; message: string; code: string | null; position: number | null } {
  if (error == null || typeof error !== 'object') {
    return { ok: false, message: String(error), code: null, position: null }
  }
  const position = readString(error, 'position')
  const parsedPosition = position == null ? Number.NaN : Number.parseInt(position, 10)
  return {
    ok: false,
    message: readString(error, 'message') ?? String(error),
    code: readString(error, 'code'),
    position: Number.isInteger(parsedPosition) ? parsedPosition : null,
  }
}

function readString(source: object, key: string): string | null {
  if (!(key in source)) return null
  const value: unknown = Reflect.get(source, key)
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return null
}
