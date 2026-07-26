import { describe, expect, it } from 'vitest'
import { splitStatements } from '../statements'

describe('splitStatements', () => {
  it('reads one statement, with or without a trailing semicolon', () => {
    expect(splitStatements('SELECT 1')).toEqual(['SELECT 1'])
    expect(splitStatements('SELECT 1;')).toEqual(['SELECT 1'])
    expect(splitStatements('  SELECT 1 ;  ')).toEqual(['SELECT 1'])
    expect(splitStatements('')).toEqual([])
    expect(splitStatements(';;')).toEqual([])
  })

  it('separates statements on a top-level semicolon', () => {
    expect(splitStatements('SELECT 1; SELECT 2')).toEqual(['SELECT 1', 'SELECT 2'])
    expect(splitStatements('DELETE FROM document; SELECT 1;')).toEqual(['DELETE FROM document', 'SELECT 1'])
  })

  it('does not split on a semicolon inside a string literal', () => {
    expect(splitStatements("SELECT 'a;b'")).toEqual(["SELECT 'a;b'"])
    expect(splitStatements("SELECT 'it''s a;b' AS x")).toEqual(["SELECT 'it''s a;b' AS x"])
    expect(splitStatements("SELECT E'a\\';b'")).toEqual(["SELECT E'a\\';b'"])
  })

  it('does not split on a semicolon inside a quoted identifier', () => {
    expect(splitStatements('SELECT "a;b" FROM document')).toEqual(['SELECT "a;b" FROM document'])
  })

  it('does not split on a semicolon inside a dollar-quoted body', () => {
    expect(splitStatements('SELECT $$a;b$$')).toEqual(['SELECT $$a;b$$'])
    expect(splitStatements('SELECT $tag$a;b$tag$')).toEqual(['SELECT $tag$a;b$tag$'])
  })

  it('treats $1 as a bind parameter, not the start of a dollar quote', () => {
    expect(splitStatements('SELECT * FROM document WHERE path = $1; SELECT 2')).toEqual(['SELECT * FROM document WHERE path = $1', 'SELECT 2'])
  })

  it('does not split on a semicolon inside a comment', () => {
    expect(splitStatements('SELECT 1 -- a; b\n')).toEqual(['SELECT 1 -- a; b'])
    expect(splitStatements('SELECT /* a; b */ 1')).toEqual(['SELECT /* a; b */ 1'])
    expect(splitStatements('SELECT /* a /* b; */ c */ 1')).toEqual(['SELECT /* a /* b; */ c */ 1'])
  })

  it('keeps an unterminated literal as one statement', () => {
    expect(splitStatements("SELECT 'a; SELECT 2")).toEqual(["SELECT 'a; SELECT 2"])
  })
})
