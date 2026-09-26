import type { DocumentExtractor, ExtractedBlock, ExtractInput, Extraction } from '@arxhub/sql'
import { address, MAX_FILE_BYTES, type Point, pointOf } from './model'
import { parseWorkbook, type Workbook } from './workbook'

// A cell is searchable by what it literally holds. A formula's value needs the calculation engine, and
// its source text (`=SUM(A1:A3)`) is not what a reader would search for.
export function extractWorkbook(input: Pick<ExtractInput, 'bytes' | 'text'>): Extraction | null {
  // Checked before decoding: parseWorkbook refuses the same size, but only after the whole file has been
  // turned into a string on the main thread, and a workbook the editor cannot open has no cells to find.
  if (input.bytes.length > MAX_FILE_BYTES) return null
  let book: Workbook
  try {
    book = parseWorkbook(input.text())
  } catch {
    // A workbook the editor cannot open is indexed by its metadata only, the same as any unread file.
    return null
  }
  const blocks: ExtractedBlock[] = []
  for (const worksheet of book.sheets) {
    const cells: { point: Point; content: string }[] = []
    for (const [key, raw] of Object.entries(worksheet.sheet.cells)) {
      const point = pointOf(key)
      if (!point || raw.startsWith('=')) continue
      const content = (raw.startsWith("'") ? raw.slice(1) : raw).trim()
      if (content) cells.push({ point, content })
    }
    cells.sort((a, b) => a.point.row - b.point.row || a.point.column - b.point.column)
    for (const { point, content } of cells) blocks.push({ type: 'cell', content, anchor: { part: worksheet.id, id: address(point) } })
  }
  return { blocks }
}

export const workbookExtractor: DocumentExtractor = {
  id: 'sheets',
  kind: 'arxs',
  version: 1,
  extensions: ['.arxs'],
  inlineMarkup: false,
  extract: extractWorkbook,
}

// An anchor that names neither a worksheet nor a cell cannot be placed in a grid, so it is refused rather
// than landing on A1 of whatever sheet happens to be active.
export function sheetAnchorTarget(book: Workbook, anchor: { part?: string; blockId?: string }): { sheetId: string; point: Point } | null {
  if (!anchor.part && !anchor.blockId) return null
  const sheetId = anchor.part ?? book.active
  if (!book.sheets.some((entry) => entry.id === sheetId)) return null
  const point = anchor.blockId ? pointOf(anchor.blockId) : { row: 0, column: 0 }
  return point ? { sheetId, point } : null
}
