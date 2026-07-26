import { describe, expect, it } from 'vitest'
import { buildTsQuery, parseSearchQuery } from '../search-query'

describe('parseSearchQuery', () => {
  it('reads a single word', () => {
    const parsed = parseSearchQuery('заметка ')
    expect(parsed.empty).toBe(false)
    expect(parsed.clauses).toEqual([{ terms: [{ words: ['заметка'], phrase: false }] }])
    expect(parsed.prefixLast).toBe(false)
    expect(parsed.freeText).toBe('заметка')
    expect(parsed.warnings).toEqual([])
  })

  it('reads several words as clauses that all have to match', () => {
    expect(parseSearchQuery('альфа бета').clauses).toEqual([
      { terms: [{ words: ['альфа'], phrase: false }] },
      { terms: [{ words: ['бета'], phrase: false }] },
    ])
  })

  it('reads quoted text as one phrase', () => {
    expect(parseSearchQuery('"два слова" хвост').clauses).toEqual([
      { terms: [{ words: ['два', 'слова'], phrase: true }] },
      { terms: [{ words: ['хвост'], phrase: false }] },
    ])
  })

  it('reads a leading minus as an exclusion', () => {
    const parsed = parseSearchQuery('альфа -бета -"два слова"')
    expect(parsed.clauses).toEqual([{ terms: [{ words: ['альфа'], phrase: false }] }])
    expect(parsed.exclusions).toEqual([
      { words: ['бета'], phrase: false },
      { words: ['два', 'слова'], phrase: true },
    ])
  })

  it('merges the words around OR into one clause', () => {
    expect(parseSearchQuery('альфа OR бета').clauses).toEqual([
      {
        terms: [
          { words: ['альфа'], phrase: false },
          { words: ['бета'], phrase: false },
        ],
      },
    ])
  })

  it('keeps chaining OR into the same clause and leaves earlier words alone', () => {
    expect(parseSearchQuery('гамма альфа OR бета OR дельта').clauses).toEqual([
      { terms: [{ words: ['гамма'], phrase: false }] },
      {
        terms: [
          { words: ['альфа'], phrase: false },
          { words: ['бета'], phrase: false },
          { words: ['дельта'], phrase: false },
        ],
      },
    ])
  })

  it('reads or is a word unless it is written in upper case', () => {
    expect(parseSearchQuery('альфа or бета').clauses).toHaveLength(3)
  })

  it('reads every qualifier, quoted values included', () => {
    const parsed = parseSearchQuery('title:Отчёт path:notes tag:работа ext:.MD in:notes/2026 "хвост"')
    expect(parsed.qualifiers).toEqual([
      { name: 'title', value: 'Отчёт' },
      { name: 'path', value: 'notes' },
      { name: 'tag', value: 'работа' },
      { name: 'ext', value: '.MD' },
      { name: 'in', value: 'notes/2026' },
    ])
    expect(parsed.clauses).toEqual([{ terms: [{ words: ['хвост'], phrase: true }] }])
  })

  it('reads a quoted qualifier value as one value', () => {
    expect(parseSearchQuery('title:"две части" альфа').qualifiers).toEqual([{ name: 'title', value: 'две части' }])
  })

  it('keeps both values when the same qualifier is written twice', () => {
    expect(parseSearchQuery('tag:альфа tag:бета').qualifiers).toEqual([
      { name: 'tag', value: 'альфа' },
      { name: 'tag', value: 'бета' },
    ])
  })

  it('leaves the qualifiers out of freeText', () => {
    expect(parseSearchQuery('альфа title:Отчёт бета').freeText).toBe('альфа бета')
  })

  it('reads an unclosed quote as a phrase to the end of the query and says so', () => {
    const parsed = parseSearchQuery('альфа "два слова')
    expect(parsed.clauses).toEqual([{ terms: [{ words: ['альфа'], phrase: false }] }, { terms: [{ words: ['два', 'слова'], phrase: true }] }])
    expect(parsed.warnings).toHaveLength(1)
    expect(parsed.warnings[0]).toContain('quote')
  })

  it('drops a qualifier with no value and says so', () => {
    const parsed = parseSearchQuery('title:')
    expect(parsed.qualifiers).toEqual([])
    expect(parsed.empty).toBe(true)
    expect(parsed.warnings).toHaveLength(1)
    expect(parsed.warnings[0]).toContain('title:')
  })

  it('drops a dangling OR and says so', () => {
    const trailing = parseSearchQuery('альфа OR')
    expect(trailing.clauses).toEqual([{ terms: [{ words: ['альфа'], phrase: false }] }])
    expect(trailing.warnings).toHaveLength(1)

    const leading = parseSearchQuery('OR альфа')
    expect(leading.clauses).toEqual([{ terms: [{ words: ['альфа'], phrase: false }] }])
    expect(leading.warnings).toHaveLength(1)
  })

  it('reads an empty query as empty and says so', () => {
    const parsed = parseSearchQuery('   ')
    expect(parsed.empty).toBe(true)
    expect(parsed.clauses).toEqual([])
    expect(parsed.warnings).toHaveLength(1)
  })

  it('marks the last word for prefix search while it is still being typed', () => {
    expect(parseSearchQuery('заме').prefixLast).toBe(true)
    expect(parseSearchQuery('заме ').prefixLast).toBe(false)
    expect(parseSearchQuery('').prefixLast).toBe(false)
  })

  it('is not empty when only qualifiers were written', () => {
    const parsed = parseSearchQuery('ext:md ')
    expect(parsed.empty).toBe(false)
    expect(parsed.clauses).toEqual([])
  })
})

describe('buildTsQuery', () => {
  it('joins words with the and operator', () => {
    expect(buildTsQuery(parseSearchQuery('альфа бета '))).toBe('альфа & бета')
  })

  it('joins the words of a phrase with the adjacency operator', () => {
    expect(buildTsQuery(parseSearchQuery('"два слова" '))).toBe('два <-> слова')
  })

  it('negates an exclusion and parenthesises an excluded phrase', () => {
    expect(buildTsQuery(parseSearchQuery('альфа -бета '))).toBe('альфа & !бета')
    expect(buildTsQuery(parseSearchQuery('альфа -"два слова" '))).toBe('альфа & !(два <-> слова)')
  })

  it('parenthesises an OR group', () => {
    expect(buildTsQuery(parseSearchQuery('альфа OR бета '))).toBe('(альфа | бета)')
    expect(buildTsQuery(parseSearchQuery('гамма альфа OR бета '))).toBe('гамма & (альфа | бета)')
  })

  it('marks the last word as a prefix while it is being typed', () => {
    expect(buildTsQuery(parseSearchQuery('альфа бет'))).toBe('альфа & бет:*')
    expect(buildTsQuery(parseSearchQuery('"два слов'))).toBe('два <-> слов:*')
  })

  it('drops everything that is not a letter, a digit or an underscore', () => {
    expect(buildTsQuery(parseSearchQuery('аль-фа! бе:та '))).toBe('альфа & бета')
    // Whatever the user types, the built expression cannot carry a tsquery operator of its own.
    expect(buildTsQuery(parseSearchQuery("альфа & !бета | ' "))).toBe('альфа & бета')
  })

  it('folds the words when asked, so a query typed without diacritics matches a folded column', () => {
    expect(buildTsQuery(parseSearchQuery('Café '), { fold: true })).toBe('cafe')
    expect(buildTsQuery(parseSearchQuery('Café '))).toBe('Café')
  })

  it('is empty when no word survived the fold', () => {
    expect(buildTsQuery(parseSearchQuery('--- '))).toBe('')
    expect(buildTsQuery(parseSearchQuery('ext:md '))).toBe('')
  })
})
