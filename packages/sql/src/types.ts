// A row of a query result. Values come back from the DBMS already decoded, so the engine does not
// narrow them any further — a caller that knows its own query passes its own row type.
export type SqlRow = Record<string, unknown>

// One column of a result set. `type` is the Postgres type name behind `dataTypeId`, resolved from
// `pg_type` when the index is opened, so the console can label a column it has never seen.
export interface SqlField {
  name: string
  dataTypeId: number
  type: string
}

export interface SqlQueryResult<R = SqlRow> {
  rows: R[]
  fields: SqlField[]
}

export interface SqlReadOnlyLimits {
  maxRows?: number
  timeoutMs?: number
}

export const DEFAULT_MAX_ROWS = 500
export const DEFAULT_TIMEOUT_MS = 5000

export interface SqlReadOnlySuccess<R = SqlRow> {
  ok: true
  rows: R[]
  fields: SqlField[]
  rowCount: number
  truncated: boolean
  durationMs: number
}

export interface SqlReadOnlyFailure {
  ok: false
  message: string
  // The DBMS' SQLSTATE when the DBMS refused the query (e.g. 25006 for a write inside a READ ONLY
  // transaction, 57014 for a statement that ran past its timeout), or one of SQL_REJECTION when the
  // engine refused it before the DBMS saw it.
  code: string | null
  // Offset of the offending character in the query text, 1-based, as the DBMS reported it.
  position: number | null
  durationMs: number
}

export type SqlReadOnlyResult<R = SqlRow> = SqlReadOnlySuccess<R> | SqlReadOnlyFailure

// Codes the engine produces itself, before the query reaches the DBMS. Anything else in
// SqlReadOnlyFailure.code is a Postgres SQLSTATE.
export const SQL_REJECTION = {
  MULTIPLE_STATEMENTS: 'multiple_statements',
  EMPTY_STATEMENT: 'empty_statement',
} as const

// Everything that can run statements: the index itself and a transaction handed to `transaction()`.
export interface SqlExecutor {
  // Runs one statement with bound parameters. This is the plugin/internal path — no READ ONLY
  // transaction and no row limit, because a plugin is part of the product and not user input.
  query<R = SqlRow>(sql: string, params?: unknown[]): Promise<SqlQueryResult<R>>
  // Runs a statement (or several, separated by semicolons) for its effect. No parameters: the DBMS'
  // simple query protocol does not take them.
  exec(sql: string): Promise<void>
}

export interface SqlIndex extends SqlExecutor {
  readonly dataDir: string
  readonly closed: boolean
  // The user-query path: one statement, inside a READ ONLY transaction, with a row and time limit.
  // A rejected query comes back as a value, not a throw — a typo is an answer, not a crash.
  readOnly<R = SqlRow>(sql: string, params?: unknown[], limits?: SqlReadOnlyLimits): Promise<SqlReadOnlyResult<R>>
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>
  // Idempotent: closing an already closed index does nothing and does not fail.
  close(): Promise<void>
}

export interface OpenSqlIndexOptions {
  // Where the index lives. 'memory://' is an index that is not kept (tests); 'idb://<name>' is the
  // browser's own storage. Never a path inside the content store — the index is derived and
  // device-local, and must not be walked by sync.
  dataDir: string
}
