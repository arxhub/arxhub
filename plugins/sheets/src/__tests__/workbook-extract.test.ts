import { assembleDocument } from '@arxhub/sql'
import { expect, test } from 'vitest'
import { emptySheet, MAX_FILE_BYTES } from '../model'
import { serializeWorkbook, type Workbook } from '../workbook'
import { extractWorkbook, sheetAnchorTarget, workbookExtractor } from '../workbook-extract'

const book = (): Workbook => ({
  version: 2,
  active: 'a',
  sheets: [
    {
      id: 'a',
      name: 'Data',
      sheet: { ...emptySheet(), cells: { B2: 'second row', A1: 'first', C1: '=SUM(A1:A3)', A3: '   ', D1: "'#not-a-tag" } },
    },
    { id: 'b', name: 'Summary', sheet: { ...emptySheet(), cells: { A1: 'total' } } },
  ],
})

const input = (text: string) => ({ bytes: new TextEncoder().encode(text), text: () => text })

test('one cell block per literal cell, row-major within each worksheet, anchored at the worksheet and address', () => {
  const extraction = extractWorkbook(input(serializeWorkbook(book())))
  expect(extraction?.blocks).toEqual([
    { type: 'cell', content: 'first', anchor: { part: 'a', id: 'A1' } },
    { type: 'cell', content: '#not-a-tag', anchor: { part: 'a', id: 'D1' } },
    { type: 'cell', content: 'second row', anchor: { part: 'a', id: 'B2' } },
    { type: 'cell', content: 'total', anchor: { part: 'b', id: 'A1' } },
  ])
})

test('a workbook that does not parse declines, leaving the file to its metadata', () => {
  expect(extractWorkbook(input('{not json'))).toBeNull()
  expect(extractWorkbook(input(JSON.stringify({ version: 9 })))).toBeNull()
})

test('a workbook larger than the editor opens is declined without being decoded', () => {
  const text = () => {
    throw new Error('decoded')
  }
  expect(extractWorkbook({ bytes: new Uint8Array(MAX_FILE_BYTES + 1), text })).toBeNull()
})

test('a legacy single-sheet file is read as one worksheet', () => {
  const extraction = extractWorkbook(input(JSON.stringify({ ...emptySheet(), cells: { A2: 'legacy' } })))
  expect(extraction?.blocks).toEqual([{ type: 'cell', content: 'legacy', anchor: { part: 'sheet1', id: 'A2' } }])
})

test('cell text is data: no tags or links are read out of it', () => {
  const text = serializeWorkbook(book())
  const bytes = new TextEncoder().encode(text)
  const extraction = extractWorkbook(input(text))
  if (!extraction) throw new Error('expected an extraction')
  const doc = assembleDocument(
    'book.arxs',
    'arxs',
    extraction,
    bytes,
    { size: bytes.length, mtime: 0 },
    { inlineMarkup: workbookExtractor.inlineMarkup },
  )
  expect(doc.tags).toEqual([])
  expect(doc.blocks.map((block) => [block.type, block.anchorId, block.part])).toContainEqual(['cell', 'B2', 'a'])
})

test('an anchor lands on its worksheet and cell', () => {
  expect(sheetAnchorTarget(book(), { part: 'b', blockId: 'A1' })).toEqual({ sheetId: 'b', point: { row: 0, column: 0 } })
  expect(sheetAnchorTarget(book(), { blockId: 'C4' })).toEqual({ sheetId: 'a', point: { row: 3, column: 2 } })
  expect(sheetAnchorTarget(book(), { part: 'b' })).toEqual({ sheetId: 'b', point: { row: 0, column: 0 } })
})

test('an anchor naming a gone worksheet, a bad address or nothing at all is refused', () => {
  expect(sheetAnchorTarget(book(), { part: 'gone', blockId: 'A1' })).toBeNull()
  expect(sheetAnchorTarget(book(), { part: 'a', blockId: 'not a cell' })).toBeNull()
  expect(sheetAnchorTarget(book(), {})).toBeNull()
})
