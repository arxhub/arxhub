import { describe, expect, it } from 'vitest'
import { parseConsoleQuery, SQL_CONSOLE_EXAMPLE } from '../ui/sql-console-state'

describe('the query text kept per device', () => {
  it('reads an absent entry as an empty console', () => {
    expect(parseConsoleQuery(null)).toBe('')
  })

  it('gives back exactly what was stored, whitespace and newlines included', () => {
    const query = 'SELECT path,\n  title\nFROM document\n'
    expect(parseConsoleQuery(query)).toBe(query)
  })

  it('cuts an entry that is a pasted file rather than a query — localStorage is not a place for one', () => {
    const huge = 'x'.repeat(50_000)
    expect(parseConsoleQuery(huge)).toHaveLength(20_000)
  })

  it('offers an example that reads the table every other one hangs off', () => {
    expect(SQL_CONSOLE_EXAMPLE).toContain('FROM document')
    // It has to be one statement: the user path refuses anything else.
    expect(SQL_CONSOLE_EXAMPLE.split(';').filter((part) => part.trim() !== '')).toHaveLength(1)
  })
})
