import { expect, test } from 'vitest'
import { copyRange, csvPatch, exportCsv, fillRange, parseTsv, pasteRange } from '../clipboard'
import { address, emptySheet, parseSheet, pointOf, SheetHistory } from '../model'

test('strict format round trips sparse cells and refuses unknown data', () => {
  const sheet = { ...emptySheet(), cells: { A1: '=1+2', Z1000: 'Hello' } }
  expect(parseSheet(JSON.stringify(sheet))).toEqual(sheet)
  for (const raw of [
    '',
    '{}',
    JSON.stringify({ ...sheet, version: 2 }),
    JSON.stringify({ ...sheet, future: true }),
    JSON.stringify({ ...sheet, cells: { A1001: 'lost' } }),
    JSON.stringify({ ...sheet, cells: { A1: { formula: '1+2' } } }),
    JSON.stringify({ ...sheet, cells: { a1: 'lost' } }),
    JSON.stringify({ ...sheet, cells: { A1: 'x'.repeat(4097) } }),
  ]) {
    expect(() => parseSheet(raw)).toThrow()
  }
  expect(pointOf('IV10000')).toEqual({ row: 9999, column: 255 })
  expect(address({ row: 9999, column: 255 })).toBe('IV10000')
})

test('bulk patches are atomic and undo restores overwritten and cleared cells', () => {
  const history = new SheetHistory({ ...emptySheet(), cells: { A1: 'original', A2: '5' } })
  expect(() => history.apply({ A1: 'changed', A1001: 'invalid' })).toThrow()
  expect(history.sheet.cells).toEqual({ A1: 'original', A2: '5' })
  history.apply({ A1: 'new', A2: '', B1: '=A1' })
  expect(history.sheet.cells).toEqual({ A1: 'new', B1: '=A1' })
  history.undo()
  expect(history.sheet.cells).toEqual({ A1: 'original', A2: '5' })
  history.redo()
  expect(history.sheet.cells).toEqual({ A1: 'new', B1: '=A1' })
  history.undo()
  history.apply({ C1: 'branch' })
  expect(history.canRedo).toBe(false)
})

test('clipboard preserves multiline cells and translates internal formula references', () => {
  expect(parseTsv('a\tb\r\nc\td\r\n')).toEqual([
    ['a', 'b'],
    ['c', 'd'],
  ])
  expect(parseTsv('"a\nb"\t"a""b"')).toEqual([['a\nb', 'a"b']])
  const sheet = { ...emptySheet(), cells: { A1: '2', B1: '=A1*$C$1', A2: 'line\nbreak' } }
  const data = copyRange(sheet, { row: 0, column: 0 }, { row: 1, column: 1 })
  expect(pasteRange(sheet, { row: 3, column: 0 }, data.text, data.internal)).toEqual({ A4: '2', B4: '=A4*$C$1', A5: 'line\nbreak', B5: '' })
  expect(() => pasteRange(sheet, { row: 999, column: 25 }, data.text)).toThrow()
})

test('CSV preserves Unicode, quoted cells, empty trailing cells and formulas', () => {
  const sheet = { ...emptySheet(), cells: { A1: 'Привет, мир', B1: '=SUM(A2:A3)', A2: 'line\nbreak', B2: 'a"b' } }
  const csv = exportCsv(sheet)
  expect(csvPatch(emptySheet(), { row: 0, column: 0 }, `\uFEFF${csv}`)).toEqual(sheet.cells)
  expect(csvPatch(emptySheet(), { row: 0, column: 0 }, 'a,b,\r\n')).toEqual({ A1: 'a', B1: 'b', C1: '' })
})

test('fill uses the top row or left column of either selection direction and preserves anchors', () => {
  const sheet = { ...emptySheet(), cells: { B1: '=A1*$D$1', B2: 'old', B3: 'old', A2: '=A1+1' } }
  expect(fillRange(sheet, { row: 2, column: 1 }, { row: 0, column: 1 }, 'down')).toEqual({ B1: '=A1*$D$1', B2: '=A2*$D$1', B3: '=A3*$D$1' })
  expect(fillRange(sheet, { row: 1, column: 0 }, { row: 1, column: 2 }, 'right')).toEqual({ A2: '=A1+1', B2: '=B1+1', C2: '=C1+1' })
})
