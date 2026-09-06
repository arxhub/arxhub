// Bump whenever anything below changes shape. An index written by another version is discarded, not
// migrated (FR-217): every row is recoverable by walking the content store, so rebuilding is cheaper
// than carrying a data migration for a derived index.
export const SQL_SCHEMA_VERSION = 2

export const SCHEMA_VERSION_KEY = 'schema_version'

// Full-text configuration for every tsvector in the schema. Deliberately 'simple' rather than
// 'english'/'russian': the vault is multilingual and stemming one language degrades search in the
// other. The cost — word forms do not collapse — is paid back by prefix search and by fuzzy title
// matching.
export const FTS_CONFIG = 'simple'

// Read before the app trusts any other table, so it is created on its own and never dropped: without
// it there is nowhere to read the version from.
export const INDEX_META_DDL = `
  CREATE TABLE IF NOT EXISTS index_meta (
    key text PRIMARY KEY,
    value text NOT NULL
  )
`

// Drop order, children first — the FKs are ON DELETE CASCADE, but CASCADE on the DROP is what makes
// the order not matter; keeping it right anyway means the statement stays readable.
export const CONTENT_TABLES = ['ref', 'tag', 'block', 'document'] as const

// One statement per entry: `exec` would take them all at once, but a failure then names the batch
// rather than the statement.
export const CONTENT_SCHEMA_DDL: readonly string[] = [
  `CREATE TABLE document (
    path text PRIMARY KEY,
    name text NOT NULL,
    dir text NOT NULL,
    ext text NOT NULL,
    kind text NOT NULL,
    title text NOT NULL,
    title_fold text NOT NULL,
    content text NOT NULL DEFAULT '',
    frontmatter jsonb,
    size bigint NOT NULL,
    mtime bigint NOT NULL,
    ctime bigint NOT NULL,
    hash text,
    indexed_at timestamptz NOT NULL DEFAULT now(),
    tsv tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('${FTS_CONFIG}', title), 'A') || setweight(to_tsvector('${FTS_CONFIG}', content), 'B')
    ) STORED
  )`,
  'CREATE INDEX document_tsv_idx ON document USING gin (tsv)',
  'CREATE INDEX document_title_fold_trgm_idx ON document USING gin (title_fold gin_trgm_ops)',
  'CREATE INDEX document_dir_idx ON document (dir)',
  'CREATE INDEX document_ext_idx ON document (ext)',
  'CREATE INDEX document_mtime_idx ON document (mtime)',
  `CREATE TABLE block (
    id text PRIMARY KEY,
    doc_path text NOT NULL REFERENCES document (path) ON DELETE CASCADE,
    ordinal int NOT NULL,
    type text NOT NULL,
    -- Heading depth for a heading, nesting depth for a list item or a task, null otherwise.
    level int,
    -- Done state of a task; null for every other type, so "unfinished" and "not a task" stay apart.
    checked boolean,
    content text NOT NULL,
    tsv tsvector GENERATED ALWAYS AS (to_tsvector('${FTS_CONFIG}', content)) STORED
  )`,
  'CREATE INDEX block_tsv_idx ON block USING gin (tsv)',
  'CREATE INDEX block_doc_path_ordinal_idx ON block (doc_path, ordinal)',
  `CREATE TABLE ref (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    src_path text NOT NULL REFERENCES document (path) ON DELETE CASCADE,
    src_block text,
    target_raw text NOT NULL,
    target_path text,
    kind text NOT NULL,
    label text
  )`,
  'CREATE INDEX ref_src_path_idx ON ref (src_path)',
  'CREATE INDEX ref_target_path_idx ON ref (target_path)',
  'CREATE UNIQUE INDEX ref_src_target_kind_idx ON ref (src_path, target_raw, kind)',
  `CREATE TABLE tag (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    doc_path text NOT NULL REFERENCES document (path) ON DELETE CASCADE,
    block_id text,
    name text NOT NULL,
    name_fold text NOT NULL
  )`,
  'CREATE INDEX tag_name_fold_idx ON tag (name_fold)',
  // NULLS NOT DISTINCT: block_id is null for a tag that came from the document's metadata, and the
  // default (nulls distinct) would let the same document-level tag be inserted twice on reindex.
  'CREATE UNIQUE INDEX tag_doc_name_block_idx ON tag (doc_path, name_fold, block_id) NULLS NOT DISTINCT',
]

export interface SqlSchemaColumn {
  name: string
  type: string
  description: string
}

export interface SqlSchemaTable {
  name: string
  description: string
  columns: readonly SqlSchemaColumn[]
}

// What the console shows so a query can be written without reading the source (Q-04 of the spec).
// Kept next to the DDL on purpose: a column added there and missed here is a column nobody can find.
export const SCHEMA_TABLES: readonly SqlSchemaTable[] = [
  {
    name: 'document',
    description: 'One row per file of the content store. Derived — the file is the source of truth.',
    columns: [
      { name: 'path', type: 'text', description: 'Path inside the content store, no leading slash. Primary key.' },
      { name: 'name', type: 'text', description: 'File name with extension.' },
      { name: 'dir', type: 'text', description: 'Parent folder; empty string at the root.' },
      { name: 'ext', type: 'text', description: 'Lower-case extension without the dot; empty string when there is none.' },
      { name: 'kind', type: 'text', description: 'How the content was read: markdown | arx | text | binary.' },
      { name: 'title', type: 'text', description: 'Title to show. Never empty.' },
      { name: 'title_fold', type: 'text', description: 'Title lower-cased and unaccented — what similarity() compares.' },
      { name: 'content', type: 'text', description: 'Flat text of the document. Empty for a binary file.' },
      { name: 'frontmatter', type: 'jsonb', description: 'Document metadata when the format carries any.' },
      { name: 'size', type: 'bigint', description: 'File size in bytes when it was indexed.' },
      { name: 'mtime', type: 'bigint', description: 'File modification time, ms.' },
      { name: 'ctime', type: 'bigint', description: 'File creation time, ms.' },
      { name: 'hash', type: 'text', description: 'Content hash when it was indexed; null when unavailable.' },
      { name: 'indexed_at', type: 'timestamptz', description: 'When the row was last reindexed.' },
      {
        name: 'tsv',
        type: 'tsvector',
        description: `Generated: title (weight A) and content (weight B) under the '${FTS_CONFIG}' configuration.`,
      },
    ],
  },
  {
    name: 'block',
    description: 'A part of a document as a unit of search — heading, paragraph, list item, code, quote. Dropped with its document.',
    columns: [
      { name: 'id', type: 'text', description: 'Document path plus the block ordinal. Not stable across versions of a document.' },
      { name: 'doc_path', type: 'text', description: 'Owning document. ON DELETE CASCADE.' },
      { name: 'ordinal', type: 'int', description: 'Position inside the document, from zero.' },
      { name: 'type', type: 'text', description: 'heading | paragraph | list-item | code | quote.' },
      { name: 'level', type: 'int', description: 'Heading level 1..6; null for other types.' },
      { name: 'content', type: 'text', description: 'Flat text of the block — what a snippet shows.' },
      { name: 'tsv', type: 'tsvector', description: `Generated from content under the '${FTS_CONFIG}' configuration.` },
    ],
  },
  {
    name: 'ref',
    description:
      'A link from a document (or one of its blocks) to another document. A link to a document that does not exist keeps target_path null.',
    columns: [
      { name: 'id', type: 'bigint', description: 'Surrogate key.' },
      { name: 'src_path', type: 'text', description: 'Document the link is written in. ON DELETE CASCADE.' },
      { name: 'src_block', type: 'text', description: 'Block the link sits in; null when it came from document metadata.' },
      { name: 'target_raw', type: 'text', description: 'Target as written, before it is resolved to a path.' },
      { name: 'target_path', type: 'text', description: 'Resolved target path, or null for a link to a document that is not indexed.' },
      { name: 'kind', type: 'text', description: 'wikilink | markdown.' },
      { name: 'label', type: 'text', description: 'Visible link text when it differs from the target.' },
    ],
  },
  {
    name: 'tag',
    description: 'A tag of a document or of one of its blocks, taken from metadata or from the text.',
    columns: [
      { name: 'id', type: 'bigint', description: 'Surrogate key.' },
      { name: 'doc_path', type: 'text', description: 'Owning document. ON DELETE CASCADE.' },
      { name: 'block_id', type: 'text', description: 'Block the tag appeared in; null when it came from document metadata.' },
      { name: 'name', type: 'text', description: 'Tag as written, without the leading marker.' },
      { name: 'name_fold', type: 'text', description: 'Tag lower-cased and unaccented — what the tag: qualifier compares.' },
    ],
  },
  {
    name: 'index_meta',
    description: 'Bookkeeping: schema version and the state of the last walk. One row per key.',
    columns: [
      { name: 'key', type: 'text', description: `${SCHEMA_VERSION_KEY} | last_scan_started_at | last_scan_finished_at | scan_cursor.` },
      { name: 'value', type: 'text', description: 'Value as a string — every reader knows its own key.' },
    ],
  },
]
