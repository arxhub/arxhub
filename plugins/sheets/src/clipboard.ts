import { validation } from '@arxhub/errors'
import { shiftFormula } from './formula'
import { address, MAX_INPUT, MAX_RANGE, type Patch, type Point, pointOf, rangePoints, type Sheet } from './model'

export const CLIPBOARD_TYPE = 'application/x-arxhub-sheet'

export function copyRange(sheet: Sheet, a: Point, b: Point): { text: string; internal: string } {
  rangePoints(a, b)
  const from = { row: Math.min(a.row, b.row), column: Math.min(a.column, b.column) }
  const rows: string[][] = []
  for (let row = from.row; row <= Math.max(a.row, b.row); row++) {
    const values: string[] = []
    for (let column = from.column; column <= Math.max(a.column, b.column); column++) values.push(sheet.cells[address({ row, column })] ?? '')
    rows.push(values)
  }
  return {
    text: rows.map((row) => row.map((value) => (/[\t\n\r"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)).join('\t')).join('\n'),
    internal: JSON.stringify({ version: 1, from, rows }),
  }
}

export function parseTsv(text: string): string[][] {
  return parseDelimited(text, '\t')
}

export function parseDelimited(text: string, delimiter: string): string[][] {
  if (text.length > 2_000_000) throw validation('Clipboard is too large')
  const rows: string[][] = [[]]
  let value = '',
    quoted = false,
    count = 0
  const push = () => {
    if (++count > MAX_RANGE || value.length > MAX_INPUT) throw validation('Paste exceeds 50,000 cells or 4096 characters per cell')
    rows[rows.length - 1].push(value)
    value = ''
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char === '"' && (quoted || value === '')) {
      if (quoted && text[i + 1] === '"') {
        value += '"'
        i++
      } else quoted = !quoted
    } else if (!quoted && (char === delimiter || char === '\n' || char === '\r')) {
      push()
      if (char !== delimiter) {
        if (char === '\r' && text[i + 1] === '\n') i++
        if (i !== text.length - 1) rows.push([])
        else return rows
      }
    } else value += char
  }
  if (quoted) throw validation('Unclosed quoted cell in clipboard')
  push()
  return rows
}

export function csvPatch(sheet: Sheet, target: Point, text: string): Patch {
  const rows = parseDelimited(text.replace(/^\uFEFF/, ''), ',')
  return pasteRange(sheet, target, rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join('\t')).join('\n'))
}

export function exportCsv(sheet: Sheet): string {
  let bottom = 0,
    right = 0
  for (const key of Object.keys(sheet.cells)) {
    const point = pointOf(key)
    if (point) {
      bottom = Math.max(bottom, point.row)
      right = Math.max(right, point.column)
    }
  }
  const data = copyRange(sheet, { row: 0, column: 0 }, { row: bottom, column: right })
  return parseTsv(data.text)
    .map((row) => row.map((value) => (/[,\r\n"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)).join(','))
    .join('\r\n')
}

export function fillRange(sheet: Sheet, a: Point, b: Point, direction: 'down' | 'right'): Patch {
  const top = Math.min(a.row, b.row),
    left = Math.min(a.column, b.column)
  const patch: Patch = {}
  for (const target of rangePoints(a, b)) {
    const source = direction === 'down' ? { row: top, column: target.column } : { row: target.row, column: left }
    patch[address(target)] = shiftFormula(sheet.cells[address(source)] ?? '', target.row - source.row, target.column - source.column)
  }
  return patch
}

export function pasteRange(sheet: Sheet, target: Point, text: string, internal = ''): Patch {
  let rows = parseTsv(text),
    from: Point | null = null
  if (internal && internal.length <= 4_000_000) {
    try {
      const value = JSON.parse(internal)
      if (
        value?.version === 1 &&
        Number.isInteger(value.from?.row) &&
        Number.isInteger(value.from?.column) &&
        value.from.row >= 0 &&
        value.from.column >= 0 &&
        Array.isArray(value.rows) &&
        value.rows.length <= MAX_RANGE &&
        value.rows.every(
          (row: unknown) => Array.isArray(row) && row.length > 0 && row.every((cell) => typeof cell === 'string' && cell.length <= MAX_INPUT),
        )
      ) {
        rows = value.rows
        from = value.from
      }
    } catch {
      /* External clipboard applications may strip or rewrite the custom payload. */
    }
  }
  const patch: Patch = {}
  let count = 0
  for (let r = 0; r < rows.length; r++)
    for (let c = 0; c < rows[r].length; c++) {
      if (++count > MAX_RANGE) throw validation('Paste exceeds 50,000 cells')
      const point = { row: target.row + r, column: target.column + c }
      if (point.row >= sheet.rows || point.column >= sheet.columns) throw validation('Paste does not fit. Add rows or columns first.')
      patch[address(point)] = from ? shiftFormula(rows[r][c], target.row - from.row, target.column - from.column) : rows[r][c]
    }
  return patch
}
