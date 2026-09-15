import { documentPath, foldText } from './document'
import { searchRegexInvalid } from './errors'
import { FTS_CONFIG } from './schema'
import { buildTsQuery, type ParsedSearchQuery, type SearchQualifier, type SearchTerm, tsQueryTerm } from './search-query'
import { SNIPPET_MATCH_END, SNIPPET_MATCH_START } from './snippet'
import type { SqlExecutor } from './types'

// Where the query looks. 'titles' is the narrow mode the interface offers as a switch — a word that is
// only in the body of a note is then not an answer.
export type SearchScope = 'all' | 'titles'

export type SearchSort = 'relevance' | 'title' | 'modified'

// Defaults of the search itself. Exported rather than inlined because the settings section owns them
// from APP-01-06 on — a tunable in a module constant is a tunable nobody can reach.
export const DEFAULT_SEARCH_LIMIT = 50
export const DEFAULT_SEARCH_OFFSET = 0
export const DEFAULT_SNIPPETS_PER_DOCUMENT = 3
export const DEFAULT_SNIPPET_WORDS = 24
// pg_trgm's own default. Below it a one-character typo in a short title still matches, and unrelated
// titles do not.
export const DEFAULT_FUZZY_THRESHOLD = 0.3

export interface SearchOptions {
  scope?: SearchScope
  sort?: SearchSort
  caseSensitive?: boolean
  regex?: boolean
  limit?: number
  offset?: number
  snippetsPerDocument?: number
  snippetWords?: number
  // How close a title has to be to the query to count as a match on its own. 1 means "identical", which
  // is how the interface turns fuzzy matching off without turning search off.
  fuzzyThreshold?: number
}

export interface SearchSnippet {
  blockId: string
  ordinal: number
  // The `.arx` block's own stable id; null for markdown and text. An opener that has this can jump to
  // the exact block a hit matched instead of the first one that reads the same.
  arxId: string | null
  // How many earlier blocks of the document already had this exact content — the fallback anchor for a
  // format with no block identity (markdown).
  occurrence: number
  // Contains SNIPPET_MATCH_START / SNIPPET_MATCH_END around each match. Split it with `snippetSegments`
  // — never insert it as markup.
  text: string
}

export interface SearchDocument {
  path: string
  title: string
  dir: string
  ext: string
  modifiedAt: number
  score: number
  snippets: SearchSnippet[]
}

export interface SearchResult {
  documents: SearchDocument[]
  totalCount: number
  // A row beyond `limit` was found, so the list the caller got is not everything.
  hasMore: boolean
  warnings: string[]
  durationMs: number
}

interface DocumentRow {
  path: string
  title: string
  dir: string
  ext: string
  modified_at: number
  score: number
}

interface BlockRow {
  id: string
  doc_path: string
  ordinal: number
  arx_id: string | null
  occurrence: number
}

interface SnippetRow extends BlockRow {
  text: string
}

interface ContentRow extends BlockRow {
  content: string
}

// Everything the SQL below is built from, resolved once so the two queries that share a WHERE clause
// agree on it.
interface Compiled {
  parsed: ParsedSearchQuery
  scope: SearchScope
  caseSensitive: boolean
  // The user's regular expression, already known to parse; null when the mode is off.
  regexPattern: string | null
  fuzzyThreshold: number
  // Aimed at `document.tsv` and `block.tsv`, which store the text as written.
  tsQuery: string
  // Aimed at `to_tsvector(title_fold)` in 'titles' scope, so a query typed without diacritics still
  // matches a title that has them.
  titleTsQuery: string
  excludeTsQuery: string
  foldedFreeText: string
}

// Collects bind parameters while the SQL text is assembled. Every user value goes through `add` — the
// only string that is ever concatenated into a statement here is the folded tsquery, which by
// construction holds nothing but word characters and tsquery operators this module wrote itself.
class Params {
  readonly values: unknown[] = []

  add(value: unknown): string {
    this.values.push(value)
    return `$${this.values.length}`
  }
}

// Runs the search and collects the result the interface renders: the documents, their snippets, how many
// there are in total and whether the list is cut.
export async function searchDocuments(index: SqlExecutor, parsed: ParsedSearchQuery, options: SearchOptions = {}): Promise<SearchResult> {
  const scope: SearchScope = options.scope === 'titles' ? 'titles' : 'all'
  const sort: SearchSort = options.sort === 'title' || options.sort === 'modified' ? options.sort : 'relevance'
  const caseSensitive = options.caseSensitive === true
  const limit = positiveInteger(options.limit, DEFAULT_SEARCH_LIMIT)
  const offset = nonNegativeInteger(options.offset, DEFAULT_SEARCH_OFFSET)
  const snippetsPerDocument = positiveInteger(options.snippetsPerDocument, DEFAULT_SNIPPETS_PER_DOCUMENT)
  const snippetWords = positiveInteger(options.snippetWords, DEFAULT_SNIPPET_WORDS)
  const fuzzyThreshold = fraction(options.fuzzyThreshold, DEFAULT_FUZZY_THRESHOLD)

  // Before anything else, and before the DBMS is asked: a broken expression is the user's typo, and the
  // answer to it is a message, not a failed query (FR-232).
  const regexPattern = options.regex === true ? validRegex(parsed.freeText) : null

  const started = performance.now()
  if (parsed.empty) {
    return { documents: [], totalCount: 0, hasMore: false, warnings: parsed.warnings, durationMs: performance.now() - started }
  }

  const compiled: Compiled = {
    parsed,
    scope,
    caseSensitive,
    regexPattern,
    fuzzyThreshold,
    tsQuery: buildTsQuery(parsed),
    titleTsQuery: buildTsQuery(parsed, { fold: true }),
    excludeTsQuery: parsed.exclusions
      .map((term) => tsQueryTerm(term))
      .filter(nonEmpty)
      .join(' | '),
    foldedFreeText: foldText(parsed.freeText),
  }

  const page = new Params()
  const score = scoreExpression(page, compiled)
  const pageSql = `SELECT d.path, d.title, d.dir, d.ext, d.mtime::float8 AS modified_at, ${score} AS score
    FROM document d
    WHERE ${conditions(page, compiled)}
    ORDER BY ${orderBy(sort)}
    LIMIT ${page.add(limit + 1)} OFFSET ${page.add(offset)}`

  const total = new Params()
  const totalSql = `SELECT count(*)::int AS total FROM document d WHERE ${conditions(total, compiled)}`

  // Sequential, not concurrent: `index` may be a transaction, where two statements in flight at once is
  // not a thing, and PGlite runs on one thread anyway — there is nothing to win.
  const pageResult = await index.query<DocumentRow>(pageSql, page.values)
  const totalResult = await index.query<{ total: number }>(totalSql, total.values)

  const hasMore = pageResult.rows.length > limit
  const rows = hasMore ? pageResult.rows.slice(0, limit) : pageResult.rows
  const snippets = await readSnippets(
    index,
    compiled,
    rows.map((row) => row.path),
    snippetsPerDocument,
    snippetWords,
  )

  return {
    documents: rows.map((row) => ({
      path: row.path,
      title: row.title,
      dir: row.dir,
      ext: row.ext,
      modifiedAt: row.modified_at,
      score: row.score,
      snippets: snippets.get(row.path) ?? [],
    })),
    totalCount: totalResult.rows[0]?.total ?? 0,
    hasMore,
    warnings: parsed.warnings,
    durationMs: performance.now() - started,
  }
}

// The blocks that answer the query, at most `snippetsPerDocument` per document and in reading order. A
// document nothing matched inside — found by its title, or found by a qualifier alone — gets its opening
// block instead, with no highlight, so a result is never a bare path (BE 4.7.4).
async function readSnippets(
  index: SqlExecutor,
  compiled: Compiled,
  paths: readonly string[],
  snippetsPerDocument: number,
  snippetWords: number,
): Promise<Map<string, SearchSnippet[]>> {
  const found = new Map<string, SearchSnippet[]>()
  if (paths.length === 0) return found

  if (compiled.tsQuery !== '') {
    const params = new Params()
    const query = `to_tsquery('${FTS_CONFIG}', ${params.add(compiled.tsQuery)})`
    const { rows } = await index.query<SnippetRow>(
      `WITH matched AS (
         SELECT b.id, b.doc_path, b.ordinal, b.arx_id, b.occurrence, b.content,
                row_number() OVER (PARTITION BY b.doc_path ORDER BY b.ordinal) AS rn
         FROM block b
         WHERE b.doc_path = ANY(${params.add([...paths])}::text[]) AND b.tsv @@ ${query}
       )
       SELECT m.id, m.doc_path, m.ordinal, m.arx_id, m.occurrence,
              ts_headline('${FTS_CONFIG}', m.content, ${query}, ${params.add(headlineOptions(snippetWords))}::text) AS text
       FROM matched m
       WHERE m.rn <= ${params.add(snippetsPerDocument)}
       ORDER BY m.doc_path, m.ordinal`,
      params.values,
    )
    for (const row of rows) {
      const list = found.get(row.doc_path) ?? []
      list.push({ blockId: row.id, ordinal: row.ordinal, arxId: row.arx_id, occurrence: row.occurrence, text: row.text })
      found.set(row.doc_path, list)
    }
  }

  const missing = paths.filter((path) => !found.has(path))
  if (missing.length === 0) return found

  const params = new Params()
  const { rows } = await index.query<ContentRow>(
    `SELECT DISTINCT ON (b.doc_path) b.id, b.doc_path, b.ordinal, b.arx_id, b.occurrence, b.content
     FROM block b
     WHERE b.doc_path = ANY(${params.add(missing)}::text[])
     ORDER BY b.doc_path, b.ordinal`,
    params.values,
  )
  for (const row of rows) {
    found.set(row.doc_path, [
      { blockId: row.id, ordinal: row.ordinal, arxId: row.arx_id, occurrence: row.occurrence, text: firstWords(row.content, snippetWords) },
    ])
  }

  return found
}

function conditions(params: Params, compiled: Compiled): string {
  const parts: string[] = []
  for (const qualifier of compiled.parsed.qualifiers) parts.push(qualifierCondition(params, qualifier))
  const match = matchCondition(params, compiled)
  if (match != null) parts.push(match)
  const exclude = excludeCondition(params, compiled)
  if (exclude != null) parts.push(exclude)
  // A query of qualifiers only is legitimate — `ext:md` asks for every note — and `empty` already
  // stopped the case where nothing at all was asked for.
  return parts.length === 0 ? 'true' : parts.join(' AND ')
}

// Two of the same qualifier become two conditions, so they narrow each other instead of the second
// replacing the first (FR-231).
function qualifierCondition(params: Params, qualifier: SearchQualifier): string {
  switch (qualifier.name) {
    case 'title':
      // strpos, not LIKE: a value holding '%' or '_' is a value, not a wildcard.
      return `strpos(d.title_fold, ${params.add(foldText(qualifier.value))}) > 0`
    case 'path':
      return `strpos(d.path, ${params.add(qualifier.value)}) > 0`
    case 'ext':
      return `d.ext = ${params.add(qualifier.value.replace(/^\.+/, '').toLowerCase())}`
    case 'in': {
      const dir = params.add(qualifierDir(qualifier.value))
      // The folder itself and everything under it: `in:` means the subtree, not one level (BE 4.2.4).
      return `(d.dir = ${dir} OR starts_with(d.dir, ${dir} || '/'))`
    }
    case 'tag':
      return `EXISTS (SELECT 1 FROM tag t WHERE t.doc_path = d.path AND t.name_fold = ${params.add(foldText(qualifier.value.replace(/^#+/, '')))})`
    case 'is':
      // The only value understood today is `favorite`; anything else asks for something that does not
      // exist and matches nothing, rather than being read as "any is: qualifier" and matching everything.
      return qualifier.value.trim().toLowerCase() === 'favorite' ? 'd.favorite' : 'false'
    case 'prop': {
      // `prop:key=value` narrows to that exact value; a bare `prop:key` (no `=`) asks only whether the
      // field is present at all, whatever its value.
      const eq = qualifier.value.indexOf('=')
      if (eq === -1) return `EXISTS (SELECT 1 FROM property p WHERE p.doc_path = d.path AND p.key = ${params.add(qualifier.value)})`
      const key = params.add(qualifier.value.slice(0, eq))
      const value = params.add(qualifier.value.slice(eq + 1))
      return `EXISTS (SELECT 1 FROM property p WHERE p.doc_path = d.path AND p.key = ${key} AND p.value = ${value})`
    }
  }
}

function matchCondition(params: Params, compiled: Compiled): string | null {
  const { parsed, scope } = compiled
  // Nothing positive was asked for — the qualifiers and the exclusions are the whole query.
  if (parsed.clauses.length === 0) return null

  if (compiled.regexPattern != null) {
    const pattern = params.add(compiled.regexPattern)
    const operator = compiled.caseSensitive ? '~' : '~*'
    return scope === 'titles' ? `d.title ${operator} ${pattern}` : `(d.title ${operator} ${pattern} OR d.content ${operator} ${pattern})`
  }

  if (compiled.caseSensitive) {
    // Full-text matching folds case by definition, so the case-sensitive mode compares substrings
    // against the columns as they are stored (BE 4.3.3).
    const clauses = parsed.clauses.map((clause) => {
      const any = clause.terms.map((term) => substringCondition(params, scope, termText(term)))
      return any.length === 1 ? any[0] : `(${any.join(' OR ')})`
    })
    return clauses.join(' AND ')
  }

  const branches: string[] = []
  if (scope === 'titles') {
    if (compiled.titleTsQuery !== '') {
      branches.push(`to_tsvector('${FTS_CONFIG}', d.title_fold) @@ to_tsquery('${FTS_CONFIG}', ${params.add(compiled.titleTsQuery)})`)
    }
  } else if (compiled.tsQuery !== '') {
    branches.push(`d.tsv @@ to_tsquery('${FTS_CONFIG}', ${params.add(compiled.tsQuery)})`)
  }
  // A title close enough to what was typed is an answer of its own, which is what finds a note through a
  // typo (FR-230). Kept in both scopes: narrowing to titles is not a reason to demand an exact one.
  if (compiled.foldedFreeText !== '') {
    branches.push(`similarity(d.title_fold, ${params.add(compiled.foldedFreeText)}) >= ${params.add(compiled.fuzzyThreshold)}`)
  }
  if (branches.length === 0) return null
  return branches.length === 1 ? branches[0] : `(${branches.join(' OR ')})`
}

// An excluded word keeps the document out however it was found, including through its title — so the
// exclusion is a condition of its own and not only a `!` inside the tsquery.
function excludeCondition(params: Params, compiled: Compiled): string | null {
  if (compiled.parsed.exclusions.length === 0) return null
  if (compiled.caseSensitive) {
    const parts = compiled.parsed.exclusions.map((term) => substringCondition(params, 'all', termText(term)))
    return `NOT (${parts.join(' OR ')})`
  }
  if (compiled.excludeTsQuery === '') return null
  return `NOT (d.tsv @@ to_tsquery('${FTS_CONFIG}', ${params.add(compiled.excludeTsQuery)}))`
}

function substringCondition(params: Params, scope: SearchScope, text: string): string {
  const value = params.add(text)
  return scope === 'titles' ? `strpos(d.title, ${value}) > 0` : `(strpos(d.title, ${value}) > 0 OR strpos(d.content, ${value}) > 0)`
}

// The title outranks the content through the weights baked into `document.tsv`, so relevance needs no
// separate term for a title hit — only the fuzzy title match, at half weight, so a near title never
// outranks a real hit (BE 4.4.1).
function scoreExpression(params: Params, compiled: Compiled): string {
  const parts: string[] = []
  if (compiled.tsQuery !== '') parts.push(`ts_rank(d.tsv, to_tsquery('${FTS_CONFIG}', ${params.add(compiled.tsQuery)}))`)
  if (compiled.foldedFreeText !== '') parts.push(`0.5 * similarity(d.title_fold, ${params.add(compiled.foldedFreeText)})`)
  return parts.length === 0 ? '0::float4' : parts.join(' + ')
}

// `d.path` last in every order: the primary key is what makes a page boundary reproducible when the key
// the user chose ties.
function orderBy(sort: SearchSort): string {
  if (sort === 'title') return 'd.title ASC, d.path ASC'
  if (sort === 'modified') return 'd.mtime DESC, d.path ASC'
  return 'score DESC, d.path ASC'
}

function headlineOptions(snippetWords: number): string {
  // Postgres insists MinWords < MaxWords, so a one-word snippet is not a thing that can be asked for.
  const maxWords = Math.max(2, snippetWords)
  const minWords = Math.max(1, Math.min(maxWords - 1, Math.floor(maxWords / 3)))
  // MaxFragments=0 selects the single-window headline: one snippet per block, which is what a block is
  // for. StartSel/StopSel are this module's own marks — see ./snippet.
  return `MaxWords=${maxWords}, MinWords=${minWords}, MaxFragments=0, StartSel=${SNIPPET_MATCH_START}, StopSel=${SNIPPET_MATCH_END}`
}

function firstWords(text: string, count: number): string {
  const words = text.split(/\s+/).filter(nonEmpty)
  return words.length <= count ? words.join(' ') : words.slice(0, count).join(' ')
}

function termText(term: SearchTerm): string {
  return term.words.join(' ')
}

function qualifierDir(value: string): string {
  return documentPath(value.replace(/\/+$/, ''))
}

function validRegex(pattern: string): string {
  try {
    // Constructing it is the whole check: Postgres does the matching, and an expression JavaScript
    // cannot parse — an unclosed group, a dangling quantifier — is one Postgres rejects too.
    new RegExp(pattern)
  } catch (error) {
    throw searchRegexInvalid(pattern, error)
  }
  return pattern
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  const rounded = Math.trunc(value)
  return rounded > 0 ? rounded : fallback
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  const rounded = Math.trunc(value)
  return rounded >= 0 ? rounded : fallback
}

function fraction(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

function nonEmpty(value: string): boolean {
  return value !== ''
}
