import { setLanguagePreference } from '@arxhub/i18n'
import { parseSearchQuery, SQL_REJECTION, searchRegexInvalid } from '@arxhub/sql'
import { afterEach, describe, expect, test } from 'vitest'
import { regexErrorText, rejectionText, warningText } from '../search-texts'

// The parser's warnings are English sentences with no code; these run the real parser, so a sentence reworded
// in packages/sql fails here rather than quietly reaching a Russian screen in English.
const QUERIES = ['"unclosed', 'OR rhino', 'rhino OR', 'rhino OR -hippo', 'tag: rhino', '']

describe('search texts', () => {
  afterEach(() => setLanguagePreference('en'))

  test('every warning the parser produces has a translation', () => {
    const warnings = [...new Set(QUERIES.flatMap((query) => parseSearchQuery(query).warnings))]
    expect(warnings.length).toBeGreaterThanOrEqual(5)
    setLanguagePreference('en')
    expect(warnings.map(warningText)).toEqual(warnings)
    setLanguagePreference('ru')
    for (const warning of warnings) expect(warningText(warning)).not.toBe(warning)
    expect(warningText('tag: rhino')).toBe('tag: rhino')
  })

  test('the qualifier warning keeps the qualifier it names', () => {
    const [warning] = parseSearchQuery('tag: rhino').warnings
    setLanguagePreference('ru')
    expect(warningText(warning)).toContain('tag:')
  })

  test('an invalid expression still names its pattern, in English exactly as the engine put it', () => {
    const pattern = '(unclosed'
    let message = ''
    try {
      new RegExp(pattern)
    } catch (error) {
      message = searchRegexInvalid(pattern, error).body.message
    }
    expect(regexErrorText(message)).toBe(message)
    setLanguagePreference('ru')
    expect(regexErrorText(message)).toContain('«(unclosed»')
  })

  test('the engine’s own refusals are translated by code, a DBMS error is left alone', () => {
    setLanguagePreference('ru')
    expect(
      rejectionText({ code: SQL_REJECTION.MULTIPLE_STATEMENTS, message: 'A query must be a single statement — this one has 3.' }),
    ).toContain('3')
    expect(rejectionText({ code: SQL_REJECTION.EMPTY_STATEMENT, message: 'The query is empty.' })).toBe('Запрос пуст.')
    expect(rejectionText({ code: '25006', message: 'cannot execute DELETE in a read-only transaction' })).toBe(
      'cannot execute DELETE in a read-only transaction',
    )
  })
})
