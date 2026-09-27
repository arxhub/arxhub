import { describeError, formatNumber } from '@arxhub/i18n'
import { SQL_REJECTION, type SqlReadOnlyFailure } from '@arxhub/sql'
import { t } from './i18n/messages'
import { SEARCH_INDEX_UNAVAILABLE } from './search-extension'

// packages/sql has no UI and hands its parse warnings back as English sentences with no code, so the
// sentence IS the code here. Matched exactly: a warning this does not know is shown as it came, and the
// test beside this file runs the parser so a reworded sentence there fails here instead of going English.
const WARNINGS: Record<string, () => string> = {
  'The quote is not closed — everything to the end of the query is read as one phrase.': () => t('warnings.unclosedQuote'),
  'OR has nothing before it and was dropped.': () => t('warnings.orNothingBefore'),
  'OR has no second word and was dropped.': () => t('warnings.orNoSecond'),
  'The query is empty.': () => t('warnings.empty'),
}

const QUALIFIER_EMPTY = /^The qualifier (\S+): has no value and was dropped\.$/

export function warningText(warning: string): string {
  const known = WARNINGS[warning]
  if (known) return known()
  const qualifier = QUALIFIER_EMPTY.exec(warning)
  return qualifier ? t('warnings.qualifierEmpty', { name: qualifier[1] }) : warning
}

// The body carries the pattern only inside its English sentence (it has no field of its own), and the
// pattern is what the person has to find in the field — so it is read back out rather than dropped.
const REGEX_INVALID = /^([\s\S]*) is not a valid regular expression([\s\S]*)$/

export function regexErrorText(message: string): string {
  const parts = REGEX_INVALID.exec(message)
  return parts ? t('query.regexInvalid', { pattern: parts[1], reason: parts[2] }) : message
}

export function errorText(error: unknown): string {
  return describeError(error)?.message ?? (error instanceof Error ? error.message : String(error))
}

// The engine's own refusals are translated by their code; a DBMS error is the DBMS's text, which names
// SQL the person wrote and stays as Postgres said it.
const MULTIPLE = /has (\d+)\.$/

export function rejectionText(failure: Pick<SqlReadOnlyFailure, 'code' | 'message'>): string {
  if (failure.code === SQL_REJECTION.EMPTY_STATEMENT) return t('console.rejection.empty')
  if (failure.code === SEARCH_INDEX_UNAVAILABLE) return t('console.rejection.unavailable')
  if (failure.code === SQL_REJECTION.MULTIPLE_STATEMENTS) {
    const count = MULTIPLE.exec(failure.message)
    return count ? t('console.rejection.multiple', { count: formatNumber(Number(count[1])) }) : failure.message
  }
  return failure.message
}
