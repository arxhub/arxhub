import { expect, test } from 'vitest'
import { dateSerial, defaultFormat, formatValue } from '../format'
import { FormulaEngine } from '../formula'
import { formulaHelp } from '../formula-help'
import { emptySheet, MAX_ROWS } from '../model'
import { autofill, editStructure, renameReferences, sortRange } from '../operations'
import { cycleAnchor, formulaReferences } from '../references'
import { parseWorkbook, serializeWorkbook, type Workbook, WorkbookHistory, workbook } from '../workbook'

const sample = (): Workbook => ({
  version: 2 as const,
  active: 'a',
  sheets: [
    { id: 'a', name: 'Data', sheet: { ...emptySheet(), cells: { A1: '2', A2: '3', A3: '4', B1: '=SUM(A1:A3)', C1: '=$A$2' } } },
    { id: 'b', name: 'Summary', sheet: { ...emptySheet(), cells: { A1: "=SUM('Data'!A1:A3)", B1: "='Data'!$A$2*2" } } },
  ],
})

test('scrolling reuses parsed formulas and evaluated dependencies; changing an unrelated value leaves them cached', () => {
  const engine = new FormulaEngine({ ...emptySheet(), cells: { A1: '2', A2: '3', B1: '=SUM(A1:A2)', C1: '=B1*2' } })
  expect(engine.values(['C1'])).toEqual({ C1: 10 })
  const count = engine.evaluations
  engine.update({})
  expect(engine.values(['B1', 'C1'])).toEqual({ B1: 5, C1: 10 })
  engine.update({ Z999: 'new' })
  engine.values(['C1'])
  engine.update({ A1: '2' })
  engine.values(['C1'])
  expect(engine.evaluations).toBe(count)
  engine.update({ A1: '4' })
  expect(engine.values(['C1']).C1).toBe(14)
  expect(engine.evaluations).toBe(count + 2)
})

test('cross-sheet dependencies invalidate transitively and detect cycles', () => {
  const book = sample(),
    engine = new FormulaEngine(book.sheets[0].sheet, book)
  expect(engine.values(['A1', 'B1'], 'b')).toEqual({ A1: 9, B1: 6 })
  engine.update({ A2: '5' }, undefined, undefined, 'a')
  expect(engine.values(['A1', 'B1'], 'b')).toEqual({ A1: 11, B1: 10 })
  engine.update({ A1: "='Summary'!A1" }, undefined, undefined, 'a')
  expect(engine.values(['A1'], 'b').A1).toEqual({ error: '#CYCLE!' })
  engine.update({ A1: '1' }, undefined, undefined, 'a')
  expect(engine.values(['A1'], 'b').A1).toBe(10)
})

test('insertion, partial range deletion and absolute cross-sheet references survive undo together', () => {
  const initial = sample(),
    history = new WorkbookHistory(initial)
  const original = JSON.stringify(history.book)
  history.replace(editStructure(history.book, 'a', 'rows', 1, 2, false))
  expect(history.sheet.cells).toMatchObject({ A1: '2', A4: '3', A5: '4', B1: '=SUM(A1:A5)', C1: '=$A$4' })
  expect(history.book.sheets[1].sheet.cells.B1).toBe("='Data'!$A$4*2")
  history.replace(editStructure(history.book, 'a', 'rows', 0, 4, true))
  expect(history.book.sheets[1].sheet.cells).toEqual({ A1: "=SUM('Data'!A1:A1)", B1: '=#REF!*2' })
  history.undo()
  history.undo()
  expect(history.book).toEqual(JSON.parse(original))
  history.redo()
  expect(history.sheet.cells.A4).toBe('3')
})

test('structural operations protect capacities and move styles and widths with the data', () => {
  const book = workbook({
    ...emptySheet(),
    rows: MAX_ROWS,
    cells: { B2: 'x' },
    formats: { B2: { ...defaultFormat, kind: 'percent' } },
    widths: { 1: 160 },
  })
  expect(() => editStructure(book, 'sheet1', 'rows', 1, 1, false)).toThrow()
  const next = editStructure(book, 'sheet1', 'columns', 0, 1, false).sheets[0].sheet
  expect(next.cells.C2).toBe('x')
  expect(next.formats?.C2.kind).toBe('percent')
  expect(next.widths?.[2]).toBe(160)
  expect(book.sheets[0].sheet.cells).toEqual({ B2: 'x' })
})

test('worksheet rename rewrites qualified references but leaves string literals intact', () => {
  const book = sample()
  book.sheets[1].sheet.cells.C1 = '="Data!A1"'
  const next = renameReferences(book, 'Data', 'New Data')
  expect(next.sheets[1].sheet.cells.A1).toBe("=SUM('New Data'!A1:A3)")
  expect(next.sheets[1].sheet.cells.C1).toBe('="Data!A1"')
})

test('add, delete and edit sheets share one atomic history without resurrecting stale cell values', () => {
  const history = new WorkbookHistory(workbook())
  history.apply({ A1: 'first' })
  history.replace({ ...history.book, active: 'new', sheets: [...history.book.sheets, { id: 'new', name: 'New', sheet: emptySheet() }] })
  history.apply({ B1: 'second' })
  history.undo()
  expect(history.sheet.cells.B1).toBeUndefined()
  history.undo()
  expect(history.book.sheets).toHaveLength(1)
  expect(history.sheet.cells.A1).toBe('first')
  history.redo()
  history.redo()
  expect(history.sheet.cells.B1).toBe('second')
  const original = serializeWorkbook(history.book)
  expect(() =>
    history.replace({ ...history.book, sheets: [...history.book.sheets, { id: 'duplicate', name: 'New', sheet: emptySheet() }] }),
  ).toThrow()
  expect(serializeWorkbook(history.book)).toBe(original)
})

test('format validation and legacy roundtrip reject unknown or malformed workbook data', () => {
  expect(JSON.parse(serializeWorkbook(parseWorkbook(JSON.stringify(emptySheet()))))).toEqual(emptySheet())
  const book = sample()
  for (const value of [
    { ...book, active: 'missing' },
    { ...book, version: 3 },
    { ...book, sheets: [] },
    { ...book, future: 1 },
  ])
    expect(() => parseWorkbook(JSON.stringify(value))).toThrow()
  const sheet = { ...emptySheet(), formats: { A1: { ...defaultFormat, kind: 'number', decimals: 1000 } } }
  expect(() => parseWorkbook(JSON.stringify(sheet))).toThrow()
})

test('sort preserves header and associated columns, rebases formulas and moves cell formats', () => {
  const sheet = {
    ...emptySheet(),
    cells: { A1: 'Price', B1: 'Total', A2: '3', A3: '1', A4: '2', B2: '=A2*2', B3: '=A3*3', B4: '=A4*4' },
    formats: { B3: { ...defaultFormat, kind: 'currency' as const } },
  }
  const result = sortRange(sheet, { row: 0, column: 0 }, { row: 3, column: 1 }, 0, false, true, { A2: 3, A3: 1, A4: 2 })
  expect(result.cells).toMatchObject({ A1: 'Price', A2: '1', A3: '2', A4: '3', B2: '=A2*3', B3: '=A3*4', B4: '=A4*2' })
  expect(result.formats?.B2.kind).toBe('currency')
})

test('autofill infers numeric/date series in either direction and adjusts formulas with absolute anchors', () => {
  const sheet = { ...emptySheet(), cells: { A2: '2', A3: '4', B2: '=A2*$D$1' } }
  expect(autofill(sheet, { row: 1, column: 0 }, { row: 2, column: 0 }, { row: 5, column: 0 }).cells.A6).toBe('10')
  expect(autofill(sheet, { row: 1, column: 0 }, { row: 2, column: 0 }, { row: 0, column: 0 }).cells.A1).toBe('0')
  expect(autofill(sheet, { row: 1, column: 1 }, { row: 1, column: 1 }, { row: 3, column: 1 }).cells.B4).toBe('=A4*$D$1')
  const dates = {
    ...emptySheet(),
    cells: { A1: String(dateSerial('2026-09-12')) },
    formats: { A1: { ...defaultFormat, kind: 'date' as const } },
  }
  const next = autofill(dates, { row: 0, column: 0 }, { row: 0, column: 0 }, { row: 2, column: 0 })
  expect(next.cells.A3).toBe(String(dateSerial('2026-09-14')))
  expect(next.formats?.A3.kind).toBe('date')
  expect(dateSerial('2026-02-30')).toBeNull()
  expect(formatValue(0.125, { ...defaultFormat, kind: 'percent', decimals: 1 })).toContain('12.5')
})

test('F4 cycles all anchor modes, handles ranges and ignores quoted text', () => {
  let text = '=SUM(A1:B2)'
  for (const expected of ['=SUM($A$1:$B$2)', '=SUM(A$1:B$2)', '=SUM($A1:$B2)', '=SUM(A1:B2)']) {
    text = cycleAnchor(text, 6)!.text
    expect(text).toBe(expected)
  }
  expect(cycleAnchor('="A1"', 3)).toBeNull()
  expect(formulaReferences("='New Data'!$A1+A$2")).toHaveLength(2)
  expect(formulaHelp('=IF(SUM(A1:A2)>0,', 16).fn?.name).toBe('IF')
  expect(formulaHelp('=SU', 3).suggestions[0].name).toBe('SUM')
})

test('sheet names resembling another internal id resolve by name without corrupting cached keys', () => {
  const book: Workbook = {
    version: 2,
    active: 'sheet1',
    sheets: [
      { id: 'sheet1', name: 'sheet2', sheet: { ...emptySheet(), cells: { A1: '2' } } },
      { id: 'sheet2', name: 'Data', sheet: { ...emptySheet(), cells: { A1: '5', B1: "='sheet2'!A1" } } },
    ],
  }
  const engine = new FormulaEngine(book.sheets[0].sheet, book)
  expect(engine.values(['A1'], 'sheet1').A1).toBe(2)
  expect(engine.values(['A1', 'B1'], 'sheet2')).toEqual({ A1: 5, B1: 2 })
  engine.update({ A1: '3' }, undefined, undefined, 'sheet1')
  expect(engine.values(['B1'], 'sheet2').B1).toBe(3)
})

test('range rewrites accept whitespace and autofill repeats an irregular seed without inventing a progression', () => {
  const book = workbook({ ...emptySheet(), cells: { A1: '2', A2: '4', A3: '9', B1: '=SUM(A1 : A3)' } })
  expect(editStructure(book, 'sheet1', 'rows', 0, 1, true).sheets[0].sheet.cells).toMatchObject({ A1: '4', A2: '9' })
  expect(autofill(book.sheets[0].sheet, { row: 0, column: 0 }, { row: 2, column: 0 }, { row: 3, column: 0 }).cells.A4).toBe('2')
})
