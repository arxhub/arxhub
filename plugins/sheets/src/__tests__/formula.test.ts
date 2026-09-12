import { describe, expect, test } from 'vitest'
import { FormulaEngine, shiftFormula } from '../formula'
import { emptySheet } from '../model'

function engine(cells: Record<string, string>) {
  return new FormulaEngine({ ...emptySheet(), cells })
}
function evaluate(formula: string) {
  return engine({ A1: formula }).values(['A1']).A1
}

describe('formulas', () => {
  test.each([
    ['=2+3*4', 14],
    ['=(2+3)*4', 20],
    ['=2^3^2', 512],
    ['=-2^2', -4],
    ['=50%*200', 100],
    ['=SUM(1,2,3)', 6],
    ['=sum(1;2;3)', 6],
    ['=IF(2>1,"yes","no")', 'yes'],
    ['="a"&"b"', 'ab'],
    ['=ROUND(-1.25,1)', -1.3],
    ['=ABS(-7)', 7],
    ['=1/0', { error: '#DIV/0!' }],
    ['=BOGUS(1)', { error: '#NAME?' }],
    ['=1+', { error: '#ERROR!' }],
    ['=A0', { error: '#REF!' }],
    ['=A10001', { error: '#REF!' }],
    ['=ZZ1', { error: '#REF!' }],
    ['=IF(FALSE,1/0,7)', 7],
    ['=SUM()', 0],
    ['=AVERAGE()', { error: '#DIV/0!' }],
    ['=10^999', { error: '#NUM!' }],
    ['=1e309', { error: '#NUM!' }],
    ['=globalThis.alert(1)', { error: '#ERROR!' }],
    ['=IF(TRUE,"A1","B2")', 'A1'],
  ])('%s', (formula, value) => {
    expect(evaluate(formula)).toEqual(value)
  })

  test('dependencies invalidate through chains, empty cells, ranges and branch switches', () => {
    const calc = engine({ A1: '2', B1: '=A1*3', C1: '=SUM(B1:B3)', D1: '=IF(A1>0,C1,E1)' })
    expect(calc.values(['D1'])).toEqual({ D1: 6 })
    calc.update({ B2: '4' })
    expect(calc.values(['D1']).D1).toBe(10)
    calc.update({ A1: '-1', E1: '100' })
    expect(calc.values(['D1']).D1).toBe(100)
    calc.update({ E1: '200' })
    expect(calc.values(['D1']).D1).toBe(200)
    calc.update({ A1: '3' })
    expect(calc.values(['D1']).D1).toBe(13)
    calc.update({ B1: '8' })
    expect(calc.values(['D1']).D1).toBe(12)
    calc.update({ B2: '' })
    expect(calc.values(['D1']).D1).toBe(8)
  })

  test('cycles and dependent errors recover after an edit', () => {
    const calc = engine({ A1: '=B1', B1: '=A1', C1: '=A1+5' })
    expect(calc.values(['A1', 'B1', 'C1'])).toEqual({ A1: { error: '#CYCLE!' }, B1: { error: '#CYCLE!' }, C1: { error: '#CYCLE!' } })
    calc.update({ B1: '2' })
    expect(calc.values(['C1']).C1).toBe(7)
    calc.update({ B1: '=1/0' })
    expect(calc.values(['C1']).C1).toEqual({ error: '#DIV/0!' })
    calc.update({ B1: '3' })
    expect(calc.values(['C1']).C1).toBe(8)
  })

  test('aggregates distinguish numbers from labels and blanks', () => {
    const calc = engine({
      A1: '2',
      A2: 'label',
      A4: '8',
      B1: '=SUM(A1:A4)',
      B2: '=COUNT(A1:A4)',
      B3: '=AVERAGE(A1:A4)',
      B4: '=MIN(A1:A4)',
      B5: '=MAX(A1:A4)',
    })
    expect(calc.values(['B1', 'B2', 'B3', 'B4', 'B5'])).toEqual({ B1: 10, B2: 2, B3: 5, B4: 2, B5: 8 })
  })

  test('limits nesting and range expansion without throwing', () => {
    expect(evaluate(`=${'('.repeat(100)}1${')'.repeat(100)}`)).toEqual({ error: '#ERROR!' })
    const calc = new FormulaEngine({ ...emptySheet(), rows: 10_000, columns: 256, cells: { A1: '=SUM(A2:IV10000)' } })
    expect(calc.values(['A1']).A1).toEqual({ error: '#LIMIT!' })
  })

  test('a 10,000 row dependency range recalculates after a distant edit', () => {
    const cells: Record<string, string> = { B1: '=SUM(A1:A10000)' }
    for (let i = 1; i <= 10_000; i++) cells[`A${i}`] = '1'
    const calc = new FormulaEngine({ ...emptySheet(), rows: 10_000, cells })
    expect(calc.values(['B1']).B1).toBe(10_000)
    calc.update({ A9000: '5' })
    expect(calc.values(['B1']).B1).toBe(10_004)
  })

  test('copy shifts relative and mixed references without rewriting quoted text', () => {
    expect(shiftFormula('=A1+$A1+A$1+$A$1+SUM(B2:C3)+"A1"', 2, 1)).toBe('=B3+$A3+B$1+$A$1+SUM(C4:D5)+"A1"')
    expect(shiftFormula('=A1', -1, 0)).toBe('=#REF!')
    expect(shiftFormula("'=A1", 3, 3)).toBe("'=A1")
  })

  test('cached answers match a fresh engine after repeated dependency replacements', () => {
    const cells: Record<string, string> = { A1: '1', A2: '2', A3: '3', B1: '=SUM(A1:A3)', C1: '=IF(A1>0,B1,D1)', D1: '=B1*2' }
    const calc = engine(cells)
    const keys = ['A1', 'A2', 'A3', 'B1', 'C1', 'D1']
    const replacements = ['2', '-1', '', '=A1+1', '=SUM(A1:A3)', '=IF(A2>0,D1,4)', '=C1', '=1/0']
    let seed = 42
    const random = (max: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed % max
    }
    for (let i = 0; i < 200; i++) {
      const key = keys[random(keys.length)],
        value = replacements[random(replacements.length)]
      cells[key] = value
      calc.update({ [key]: value })
      expect(calc.values(keys)).toEqual(engine(cells).values(keys))
    }
  })
})
