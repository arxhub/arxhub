export { type ArxParse, parseArx } from './arx'
export {
  ARX_EXTENSIONS,
  type BlockType,
  blockId,
  DOCUMENT_EXTENSIONS,
  type DocumentKind,
  detectDocumentKind,
  documentDir,
  documentExtension,
  documentPath,
  type FileStat,
  foldText,
  MARKDOWN_EXTENSIONS,
  type ParsedBlock,
  type ParsedDocument,
  type ParsedRef,
  type ParsedTag,
  type RefKind,
  TEXT_EXTENSIONS,
} from './document'
export {
  searchRegexInvalid,
  searchRegexInvalidErrorSchema,
  sqlIndexClosed,
  sqlIndexClosedErrorSchema,
  sqlIndexOpen,
  sqlIndexOpenErrorSchema,
} from './errors'
export {
  type FrontmatterSplit,
  frontmatterTags,
  frontmatterTitle,
  parseFrontmatter,
  splitFrontmatter,
} from './frontmatter'
export { indexDocument, refCandidates, removeDocument, removeDocumentsUnder, resolveRefTargets, writeDocument } from './index-document'
export {
  type CreateIndexerOptions,
  createIndexer,
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_FILE_SIZE,
  type Indexer,
  type IndexerOptions,
  type IndexerState,
  type IndexerStatus,
  LAST_SCAN_FINISHED_AT_KEY,
  LAST_SCAN_STARTED_AT_KEY,
  SCAN_CURSOR_KEY,
} from './indexer'
export { parseMarkdownBlocks, type SourceBlock } from './markdown'
export { dedupeRefs, extractRefs, extractTags, isIntraVaultTarget, stripInlineMarkup } from './markup'
export { migrate, readSchemaVersion } from './migrate'
export { metadataDocument, parseDocument } from './parse-document'
export { FOLDER_MARKER_FILE, isIndexablePath, METADATA_FILE_SUFFIX, matchesGlob } from './path-filter'
export { openSqlIndex } from './pglite-index'
export {
  CONTENT_SCHEMA_DDL,
  CONTENT_TABLES,
  FTS_CONFIG,
  INDEX_META_DDL,
  SCHEMA_TABLES,
  SCHEMA_VERSION_KEY,
  SQL_SCHEMA_VERSION,
  type SqlSchemaColumn,
  type SqlSchemaTable,
} from './schema'
export {
  SCHEMA_REFERENCE_MAX_ROWS,
  SCHEMA_REFERENCE_SQL,
  type SqlSchemaReferenceColumn,
  type SqlSchemaReferenceRow,
  type SqlSchemaReferenceTable,
  toSchemaReference,
} from './schema-reference'
export {
  DEFAULT_FUZZY_THRESHOLD,
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_SEARCH_OFFSET,
  DEFAULT_SNIPPET_WORDS,
  DEFAULT_SNIPPETS_PER_DOCUMENT,
  type SearchDocument,
  type SearchOptions,
  type SearchResult,
  type SearchScope,
  type SearchSnippet,
  type SearchSort,
  searchDocuments,
} from './search'
export {
  type BuildTsQueryOptions,
  buildTsQuery,
  type ParsedSearchQuery,
  parseSearchQuery,
  SEARCH_QUALIFIERS,
  type SearchClause,
  type SearchQualifier,
  type SearchQualifierName,
  type SearchTerm,
  tsQueryTerm,
} from './search-query'
export { SNIPPET_MATCH_END, SNIPPET_MATCH_START, type SnippetSegment, snippetSegments } from './snippet'
export { splitStatements } from './statements'
export {
  DEFAULT_MAX_ROWS,
  DEFAULT_TIMEOUT_MS,
  type OpenSqlIndexOptions,
  SQL_REJECTION,
  type SqlExecutor,
  type SqlField,
  type SqlIndex,
  type SqlQueryResult,
  type SqlReadOnlyFailure,
  type SqlReadOnlyLimits,
  type SqlReadOnlyResult,
  type SqlReadOnlySuccess,
  type SqlRow,
} from './types'
