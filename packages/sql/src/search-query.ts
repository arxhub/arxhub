import { foldText } from './document'

// Prefixes that turn a lexeme into a filter on a column rather than into a word to look for. Kept as a
// list because the search field advertises exactly these to the user (APP-01-05-FE 6). `is` and `prop`
// are A-48's: `is:favorite` and `prop:key=value` (or bare `prop:key` for "has this field at all") read
// the `properties` block through `document.favorite` and the `property` table.
export const SEARCH_QUALIFIERS = ['title', 'path', 'tag', 'ext', 'in', 'is', 'prop'] as const

export type SearchQualifierName = (typeof SEARCH_QUALIFIERS)[number]

export interface SearchQualifier {
  name: SearchQualifierName
  // As the user wrote it, with the quotes taken off. Folding and normalizing is the searcher's job —
  // each qualifier compares against a different column.
  value: string
}

// A word to look for, or — with `phrase` — several words that have to sit next to each other in this
// order.
export interface SearchTerm {
  words: string[]
  phrase: boolean
}

// Every clause has to match. A clause of one term is a word or a phrase the query asks for; a clause of
// several terms is an `OR` group, where any one term answers it. Clauses stay in the order they were
// written, which is what lets the last word of the query be searched by prefix.
export interface SearchClause {
  terms: SearchTerm[]
}

export interface ParsedSearchQuery {
  input: string
  // Nothing to search for: no clause, no exclusion and no qualifier survived. The searcher answers with
  // an empty result without touching the DBMS.
  empty: boolean
  clauses: SearchClause[]
  exclusions: SearchTerm[]
  qualifiers: SearchQualifier[]
  // The input with the qualifier lexemes cut out — what fuzzy title matching compares against, and the
  // pattern in regex mode.
  freeText: string
  // The input does not end in whitespace, so the user is still typing the last word and it has to be
  // searched by prefix (FR-235).
  prefixLast: boolean
  // What was incomplete about the input. Never a reason to refuse the search — the field is read while
  // it is being typed, so half a query is the normal case (FR-234).
  warnings: string[]
}

export interface BuildTsQueryOptions {
  // Fold every word the way `title_fold` and `tag.name_fold` are folded — lower case, no diacritics.
  // For a query aimed at `document.tsv`, which stores the title and the content as written, leave it
  // off: the stored lexemes keep their diacritics and a folded query would miss them.
  fold?: boolean
}

// Everything that is not a letter, a digit or an underscore. Dropping it is what makes string
// concatenation safe in `buildTsQuery`: none of tsquery's operators survives the fold.
const NON_WORD = /[^\p{L}\p{N}_]+/gu

const QUALIFIER = /^([A-Za-z]+):([\s\S]*)$/

interface Lexeme {
  // The lexeme as written, quotes included, so classification can tell a phrase from a word.
  text: string
  start: number
  end: number
}

// Splits the user's string into lexemes and sorts them into what has to match, what must not, and what
// filters. Never throws: an unfinished query is the normal state of a field that is being typed.
export function parseSearchQuery(input: string): ParsedSearchQuery {
  const source = typeof input === 'string' ? input : ''
  const warnings: string[] = []
  const { items, unclosedQuote } = splitLexemes(source)
  if (unclosedQuote) {
    warnings.push('The quote is not closed — everything to the end of the query is read as one phrase.')
  }

  const clauses: SearchClause[] = []
  const exclusions: SearchTerm[] = []
  const qualifiers: SearchQualifier[] = []
  const qualifierSpans: [number, number][] = []
  let pendingOr = false

  for (const lexeme of items) {
    if (lexeme.text === 'OR') {
      if (clauses.length === 0) {
        warnings.push('OR has nothing before it and was dropped.')
        continue
      }
      pendingOr = true
      continue
    }

    const qualifier = QUALIFIER.exec(lexeme.text)
    const name = qualifier == null ? null : qualifierName(qualifier[1])
    if (name != null && qualifier != null) {
      qualifierSpans.push([lexeme.start, lexeme.end])
      const value = stripQuotes(qualifier[2]).trim()
      if (value === '') {
        warnings.push(`The qualifier ${name}: has no value and was dropped.`)
      } else {
        qualifiers.push({ name, value })
      }
      if (pendingOr) {
        warnings.push('OR has no second word and was dropped.')
        pendingOr = false
      }
      continue
    }

    if (lexeme.text.startsWith('-') && lexeme.text.length > 1) {
      const term = readTerm(lexeme.text.slice(1))
      if (term != null) exclusions.push(term)
      if (pendingOr) {
        warnings.push('OR has no second word and was dropped.')
        pendingOr = false
      }
      continue
    }

    const term = readTerm(lexeme.text)
    if (term == null) continue
    if (pendingOr) {
      clauses[clauses.length - 1].terms.push(term)
      pendingOr = false
    } else {
      clauses.push({ terms: [term] })
    }
  }

  if (pendingOr) warnings.push('OR has no second word and was dropped.')

  const empty = clauses.length === 0 && exclusions.length === 0 && qualifiers.length === 0
  if (empty && source.trim() === '') warnings.push('The query is empty.')

  return {
    input: source,
    empty,
    clauses,
    exclusions,
    qualifiers,
    freeText: cutSpans(source, qualifierSpans),
    prefixLast: source !== '' && !/\s$/.test(source),
    warnings,
  }
}

// The parsed query as a tsquery expression. Empty when nothing survived the fold — the caller then has
// only fuzzy title matching left.
export function buildTsQuery(parsed: ParsedSearchQuery, options: BuildTsQueryOptions = {}): string {
  const parts: string[] = []

  parsed.clauses.forEach((clause, clauseIndex) => {
    const last = clauseIndex === parsed.clauses.length - 1
    const rendered: string[] = []
    clause.terms.forEach((term, termIndex) => {
      const prefix = parsed.prefixLast && last && termIndex === clause.terms.length - 1
      const text = tsQueryTerm(term, options, prefix)
      if (text !== '') rendered.push(text)
    })
    if (rendered.length === 0) return
    // `|` binds looser than both `&` and `<->`, so a group needs the parentheses and nothing else does.
    parts.push(rendered.length === 1 ? rendered[0] : `(${rendered.join(' | ')})`)
  })

  for (const term of parsed.exclusions) {
    const text = tsQueryTerm(term, options)
    if (text === '') continue
    // `!` binds tighter than `<->`, so an excluded phrase has to be parenthesised or only its first
    // word would be negated.
    parts.push(term.words.length > 1 ? `!(${text})` : `!${text}`)
  }

  return parts.join(' & ')
}

// One term as a tsquery fragment: a word, or the words of a phrase joined by the adjacency operator.
// Empty when every word folded away to nothing.
export function tsQueryTerm(term: SearchTerm, options: BuildTsQueryOptions = {}, prefixLastWord = false): string {
  const words: string[] = []
  for (const word of term.words) {
    const folded = foldTsQueryWord(word, options.fold === true)
    if (folded !== '') words.push(folded)
  }
  if (words.length === 0) return ''
  if (prefixLastWord) words[words.length - 1] = `${words[words.length - 1]}:*`
  return words.join(term.phrase ? ' <-> ' : ' & ')
}

function foldTsQueryWord(word: string, fold: boolean): string {
  const safe = word.replace(NON_WORD, '')
  return fold ? foldText(safe) : safe
}

// A lexeme is a run of non-whitespace, except that a quoted section inside it may contain whitespace —
// which is what makes both `"two words"` and `title:"two words"` one lexeme.
function splitLexemes(input: string): { items: Lexeme[]; unclosedQuote: boolean } {
  const items: Lexeme[] = []
  let unclosedQuote = false
  let i = 0

  while (i < input.length) {
    if (/\s/.test(input[i])) {
      i++
      continue
    }
    const start = i
    let text = ''
    while (i < input.length && !/\s/.test(input[i])) {
      if (input[i] !== '"') {
        text += input[i]
        i++
        continue
      }
      text += '"'
      i++
      while (i < input.length && input[i] !== '"') {
        text += input[i]
        i++
      }
      if (i < input.length) {
        text += '"'
        i++
      } else {
        // Close it here so the rest of the lexeme classifies as an ordinary phrase; the warning is the
        // caller's to record.
        text += '"'
        unclosedQuote = true
      }
    }
    items.push({ text, start, end: i })
  }

  return { items, unclosedQuote }
}

function qualifierName(candidate: string): SearchQualifierName | null {
  const lower = candidate.toLowerCase()
  return (SEARCH_QUALIFIERS as readonly string[]).includes(lower) ? (lower as SearchQualifierName) : null
}

function readTerm(text: string): SearchTerm | null {
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    const words = text.slice(1, -1).split(/\s+/).filter(nonEmpty)
    return words.length === 0 ? null : { words, phrase: true }
  }
  return text === '' ? null : { words: [text], phrase: false }
}

function stripQuotes(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value
}

// The input with the given spans removed and the whitespace they left collapsed.
function cutSpans(input: string, spans: readonly [number, number][]): string {
  let out = ''
  let cursor = 0
  for (const [start, end] of spans) {
    out += input.slice(cursor, start)
    cursor = end
  }
  out += input.slice(cursor)
  return out.replace(/\s+/g, ' ').trim()
}

function nonEmpty(value: string): boolean {
  return value !== ''
}
