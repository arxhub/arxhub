import {
  DEFAULT_FUZZY_THRESHOLD,
  DEFAULT_MAX_EXTRACTED_FILE_SIZE,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_ROWS,
  DEFAULT_SNIPPET_WORDS,
  DEFAULT_SNIPPETS_PER_DOCUMENT,
  DEFAULT_TIMEOUT_MS,
} from '@arxhub/sql'
import { type Static, Type } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { DEFAULT_DEBOUNCE_MS } from './index-queue'

// The plugin's settings, as the schema the settings kit renders. The keys are dotted — `sql.maxRows`, not
// `sqlMaxRows` — because the form shows the key under every control as its signature line, and the group
// a setting belongs to is then readable in the value itself. TOML quotes such a key ("sql.maxRows" = 500)
// rather than nesting it, which round-trips exactly; a nested table would not reach the form at all,
// because the field model reads top-level properties only. The words for each field — and for each `group`
// id — are the catalog's (`config` in i18n/en.ts): the schema describes the file, the catalog the screen.
export const SearchConfigSchema = Type.Object({
  'sql.maxRows': Type.Integer({
    group: 'sql',
    default: DEFAULT_MAX_ROWS,
    minimum: 1,
  }),
  'sql.timeoutMs': Type.Integer({
    group: 'sql',
    unit: 'ms',
    default: DEFAULT_TIMEOUT_MS,
    minimum: 1,
  }),
  'search.snippetsPerDocument': Type.Integer({
    group: 'search',
    default: DEFAULT_SNIPPETS_PER_DOCUMENT,
    // At least one: a result is never a bare path (BE 4.7.4) — a document nothing matched inside is
    // still shown with its opening block — so zero is a value the search could not have honoured.
    minimum: 1,
    maximum: 10,
  }),
  'search.snippetWords': Type.Integer({
    group: 'search',
    unit: 'words',
    default: DEFAULT_SNIPPET_WORDS,
    minimum: 4,
    maximum: 100,
  }),
  'search.fuzzyThreshold': Type.Number({
    group: 'search',
    default: DEFAULT_FUZZY_THRESHOLD,
    minimum: 0,
    maximum: 1,
    multipleOf: 0.05,
  }),
  'index.debounceMs': Type.Integer({
    group: 'index',
    unit: 'ms',
    default: DEFAULT_DEBOUNCE_MS,
    minimum: 0,
  }),
  'index.maxFileSize': Type.Integer({
    group: 'index',
    unit: 'bytes',
    default: DEFAULT_MAX_FILE_SIZE,
    minimum: 1,
  }),
  // Separate from the prose limit: a format read by its owner's extractor (a PDF, a workbook) is larger
  // per word of text than a note is, and under 2 MiB most PDFs would be found by name only.
  'index.maxExtractedFileSize': Type.Integer({
    group: 'index',
    unit: 'bytes',
    default: DEFAULT_MAX_EXTRACTED_FILE_SIZE,
    minimum: 1,
  }),
  // Optional, unlike the numbers above, and not for want of a default: an empty list is the normal state
  // of this setting, so a reader is never asked for one. A required field that is legitimately empty also
  // blocks the global save the moment the section is opened — the form counts an unedited empty required
  // field as invalid while deliberately not showing why.
  'index.exclude': Type.Optional(
    Type.Array(Type.String(), {
      group: 'index',
      default: [],
    }),
  ),
})

export type SearchConfig = Static<typeof SearchConfigSchema>

// The same values as the code that consumes them names them. The config file speaks in dotted keys
// because that is what the owner reads; nothing below the settings page should have to.
export interface SearchSettings {
  maxRows: number
  timeoutMs: number
  snippetsPerDocument: number
  snippetWords: number
  fuzzyThreshold: number
  debounceMs: number
  maxFileSize: number
  maxExtractedFileSize: number
  exclude: readonly string[]
}

// A config file is a file: an older build wrote it, a hand can edit it, and readConfig applies defaults
// without validating. So every value is read defensively — one nonsense entry must not stop a query.
export function toSearchSettings(config: Partial<SearchConfig>): SearchSettings {
  return {
    maxRows: positiveInteger(config['sql.maxRows'], DEFAULT_MAX_ROWS),
    timeoutMs: positiveInteger(config['sql.timeoutMs'], DEFAULT_TIMEOUT_MS),
    snippetsPerDocument: boundedInteger(config['search.snippetsPerDocument'], DEFAULT_SNIPPETS_PER_DOCUMENT, 1, 10),
    snippetWords: boundedInteger(config['search.snippetWords'], DEFAULT_SNIPPET_WORDS, 4, 100),
    fuzzyThreshold: boundedNumber(config['search.fuzzyThreshold'], DEFAULT_FUZZY_THRESHOLD, 0, 1),
    debounceMs: boundedInteger(config['index.debounceMs'], DEFAULT_DEBOUNCE_MS, 0, Number.MAX_SAFE_INTEGER),
    maxFileSize: positiveInteger(config['index.maxFileSize'], DEFAULT_MAX_FILE_SIZE),
    maxExtractedFileSize: positiveInteger(config['index.maxExtractedFileSize'], DEFAULT_MAX_EXTRACTED_FILE_SIZE),
    exclude: patterns(config['index.exclude']),
  }
}

// Every default in one place, derived from the schema rather than restated — the two cannot drift.
export const DEFAULT_SEARCH_SETTINGS: SearchSettings = toSearchSettings(Value.Default(SearchConfigSchema, {}) as SearchConfig)

// Whether a saved change alters what the index CONTAINS rather than how it is read. Those settings
// decide which files have rows at all, so leaving the index as it is would answer with what the previous
// rule admitted — every other value applies to the next query or the next walk on its own.
export function reindexRequired(before: SearchSettings, after: SearchSettings): boolean {
  if (before.maxFileSize !== after.maxFileSize) return true
  if (before.maxExtractedFileSize !== after.maxExtractedFileSize) return true
  return before.exclude.length !== after.exclude.length || before.exclude.some((pattern, index) => pattern !== after.exclude[index])
}

function positiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.trunc(value)
  return rounded > 0 ? rounded : fallback
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(Math.trunc(value), min), max)
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

// Blanks are dropped rather than carried: the walk ignores them anyway, and keeping them would make a
// stray empty chip read as a change to what the index covers — and stage a full rebuild for nothing.
function patterns(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}
