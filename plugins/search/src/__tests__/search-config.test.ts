import { DEFAULT_FUZZY_THRESHOLD, DEFAULT_MAX_FILE_SIZE, DEFAULT_MAX_ROWS, DEFAULT_TIMEOUT_MS } from '@arxhub/sql'
import { Value } from '@sinclair/typebox/value'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SEARCH_SETTINGS, reindexRequired, type SearchConfig, SearchConfigSchema, toSearchSettings } from '../search-config'

describe('the settings schema', () => {
  it('declares exactly the eight settings the plugin owns, dotted so the form shows where each belongs', () => {
    expect(Object.keys(SearchConfigSchema.properties)).toEqual([
      'sql.maxRows',
      'sql.timeoutMs',
      'search.snippetsPerDocument',
      'search.snippetWords',
      'search.fuzzyThreshold',
      'index.debounceMs',
      'index.maxFileSize',
      'index.exclude',
    ])
  })

  it('groups the fields so the generated form reads as three sections in declaration order', () => {
    const groups = Object.values(SearchConfigSchema.properties).map((field) => (field as { group?: string }).group)
    expect(groups).toEqual(['SQL console', 'SQL console', 'Search', 'Search', 'Search', 'Index', 'Index', 'Index'])
  })

  it('names no widget: every field describes its data and lets the settings kit choose the control', () => {
    const text = JSON.stringify(SearchConfigSchema)
    for (const widget of ['slider', 'stepper', 'switch', 'segmented', 'chips', 'textarea']) {
      expect(text.toLowerCase()).not.toContain(`"${widget}"`)
    }
  })

  it('defaults to what the engine defaults to, so an untouched install behaves as before', () => {
    expect(DEFAULT_SEARCH_SETTINGS).toEqual({
      maxRows: DEFAULT_MAX_ROWS,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      snippetsPerDocument: 3,
      snippetWords: 24,
      fuzzyThreshold: DEFAULT_FUZZY_THRESHOLD,
      debounceMs: 400,
      maxFileSize: DEFAULT_MAX_FILE_SIZE,
      exclude: [],
    })
  })

  it('reads a file the schema has filled in', () => {
    const config = Value.Default(SearchConfigSchema, { 'sql.maxRows': 10, 'index.exclude': ['archive/**'] }) as SearchConfig
    const settings = toSearchSettings(config)
    expect(settings.maxRows).toBe(10)
    expect(settings.exclude).toEqual(['archive/**'])
    // Everything the file did not mention still comes from the schema.
    expect(settings.timeoutMs).toBe(DEFAULT_TIMEOUT_MS)
  })
})

describe('reading a config file that cannot be trusted', () => {
  it('falls back per field rather than wholesale — one bad entry must not cost the rest', () => {
    const settings = toSearchSettings({ 'sql.maxRows': Number.NaN, 'sql.timeoutMs': 250 } as unknown as SearchConfig)
    expect(settings.maxRows).toBe(DEFAULT_MAX_ROWS)
    expect(settings.timeoutMs).toBe(250)
  })

  it('refuses a row limit of zero or less: a console that can never return a row is not a setting', () => {
    expect(toSearchSettings({ 'sql.maxRows': 0 }).maxRows).toBe(DEFAULT_MAX_ROWS)
    expect(toSearchSettings({ 'sql.maxRows': -5 }).maxRows).toBe(DEFAULT_MAX_ROWS)
  })

  it('clamps a bounded value instead of dropping it — 2 is closer to what was meant than 0.3', () => {
    expect(toSearchSettings({ 'search.fuzzyThreshold': 2 }).fuzzyThreshold).toBe(1)
    expect(toSearchSettings({ 'search.fuzzyThreshold': -1 }).fuzzyThreshold).toBe(0)
    expect(toSearchSettings({ 'search.snippetsPerDocument': 99 }).snippetsPerDocument).toBe(10)
  })

  it('allows a zero debounce (reindex on the write) but not a negative one', () => {
    expect(toSearchSettings({ 'index.debounceMs': 0 }).debounceMs).toBe(0)
    expect(toSearchSettings({ 'index.debounceMs': -100 }).debounceMs).toBe(0)
  })

  it('keeps only the strings out of an exclude list, trimmed, and drops the blanks', () => {
    const settings = toSearchSettings({ 'index.exclude': [' archive/** ', '', 7, null, 'drafts/*'] } as unknown as SearchConfig)
    expect(settings.exclude).toEqual(['archive/**', 'drafts/*'])
  })

  it('answers with the defaults for a file that is not there at all', () => {
    expect(toSearchSettings({})).toEqual(DEFAULT_SEARCH_SETTINGS)
  })
})

describe('deciding whether a saved change costs a rebuild', () => {
  const base = DEFAULT_SEARCH_SETTINGS

  it('rebuilds when the excluded paths change: no query recovers a row the old rule kept out', () => {
    expect(reindexRequired(base, { ...base, exclude: ['archive/**'] })).toBe(true)
    expect(reindexRequired({ ...base, exclude: ['archive/**'] }, base)).toBe(true)
    expect(reindexRequired({ ...base, exclude: ['a', 'b'] }, { ...base, exclude: ['a', 'c'] })).toBe(true)
  })

  it('rebuilds when the size limit changes: a file past it holds only its metadata', () => {
    expect(reindexRequired(base, { ...base, maxFileSize: 1024 })).toBe(true)
  })

  it('does not rebuild for a value that only changes how the index is READ', () => {
    expect(reindexRequired(base, { ...base, maxRows: 10 })).toBe(false)
    expect(reindexRequired(base, { ...base, timeoutMs: 200 })).toBe(false)
    expect(reindexRequired(base, { ...base, snippetsPerDocument: 1 })).toBe(false)
    expect(reindexRequired(base, { ...base, snippetWords: 40 })).toBe(false)
    expect(reindexRequired(base, { ...base, fuzzyThreshold: 1 })).toBe(false)
    expect(reindexRequired(base, { ...base, debounceMs: 50 })).toBe(false)
  })

  it('does not rebuild for the same list written again', () => {
    expect(reindexRequired({ ...base, exclude: ['a', 'b'] }, { ...base, exclude: ['a', 'b'] })).toBe(false)
  })

  it('does not rebuild for a stray blank chip — it was never part of what the index covers', () => {
    const before = toSearchSettings({ 'index.exclude': ['archive/**'] })
    const after = toSearchSettings({ 'index.exclude': ['archive/**', '  '] } as unknown as SearchConfig)
    expect(reindexRequired(before, after)).toBe(false)
  })
})
