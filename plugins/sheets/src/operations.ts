import { validation } from '@arxhub/errors'
import { type CellValue, isCellError, shiftFormula } from './formula'
import { address, MAX_COLUMNS, MAX_ROWS, type Point, pointOf, rangePoints, type Sheet } from './model'
import { anchoredAddress, mapReferences, quoteSheet } from './references'
import type { Workbook } from './workbook'

export function editStructure(book: Workbook, id: string, axis: 'rows' | 'columns', index: number, count: number, remove: boolean): Workbook {
  const target = book.sheets.find((entry) => entry.id === id)
  if (!target) throw validation('Sheet is missing')
  const size = target.sheet[axis],
    coordinate = axis === 'rows' ? 'row' : 'column',
    limit = axis === 'rows' ? MAX_ROWS : MAX_COLUMNS
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 || index < 0 || index > size || (remove && index + count > size))
    throw validation('Invalid structural selection')
  const dimension = size + (remove ? -count : count)
  if (dimension < 1 || dimension > limit) throw validation(`Keep between 1 and ${limit} ${axis}`)
  const move = (value: number): number | null =>
    remove ? (value < index ? value : value < index + count ? null : value - count) : value < index ? value : value + count
  const changeReferences = (raw: string, owner: string): string =>
    mapReferences(raw, (ref) => {
      if ((ref.sheet?.toLowerCase() ?? owner.toLowerCase()) !== target.name.toLowerCase()) return ref.text
      const a = pointOf(ref.from),
        b = pointOf(ref.to ?? ref.from)
      if (!a || !b) return ref.text
      let low = Math.min(a[coordinate], b[coordinate]),
        high = Math.max(a[coordinate], b[coordinate])
      if (remove) {
        if (low >= index && high < index + count) return '#REF!'
        low = low >= index && low < index + count ? index : (move(low) ?? index)
        high = high >= index && high < index + count ? index - 1 : (move(high) ?? index - 1)
      } else {
        low = move(low)!
        high = move(high)!
      }
      const reversed = a[coordinate] > b[coordinate]
      a[coordinate] = reversed ? high : low
      b[coordinate] = reversed ? low : high
      if (!pointOf(address(a)) || !pointOf(address(b))) return '#REF!'
      return (ref.sheet ? quoteSheet(ref.sheet) : '') + anchoredAddress(ref.from, a) + (ref.to ? `:${anchoredAddress(ref.to, b)}` : '')
    })
  return {
    ...book,
    sheets: book.sheets.map((entry) => {
      const cells: Sheet['cells'] = {},
        formats: NonNullable<Sheet['formats']> = {}
      const local = entry.id === id
      const remap = (key: string): string | null => {
        if (!local) return key
        const point = pointOf(key)!,
          position = move(point[coordinate])
        if (position === null) return null
        point[coordinate] = position
        return address(point)
      }
      for (const [key, value] of Object.entries(entry.sheet.cells)) {
        const destination = remap(key)
        if (destination) cells[destination] = changeReferences(value, entry.name)
      }
      for (const [key, format] of Object.entries(entry.sheet.formats ?? {})) {
        const destination = remap(key)
        if (destination) formats[destination] = format
      }
      const sheet = { ...entry.sheet, cells, ...(entry.sheet.formats ? { formats } : {}) }
      if (local) {
        sheet[axis] = dimension
        if (axis === 'columns' && sheet.widths)
          sheet.widths = Object.fromEntries(
            Object.entries(sheet.widths).flatMap(([column, width]) => {
              const next = move(Number(column))
              return next === null ? [] : [[String(next), width]]
            }),
          )
        if (sheet.freeze)
          sheet.freeze = { rows: Math.min(sheet.freeze.rows, sheet.rows), columns: Math.min(sheet.freeze.columns, sheet.columns) }
      }
      return { ...entry, sheet }
    }),
  }
}
export function renameReferences(book: Workbook, oldName: string, nextName: string | null): Workbook {
  return {
    ...book,
    sheets: book.sheets.map((entry) => ({
      ...entry,
      sheet: {
        ...entry.sheet,
        cells: Object.fromEntries(
          Object.entries(entry.sheet.cells).map(([key, raw]) => [
            key,
            mapReferences(raw, (ref) =>
              ref.sheet?.toLowerCase() === oldName.toLowerCase()
                ? nextName === null
                  ? '#REF!'
                  : quoteSheet(nextName) + ref.from + (ref.to ? `:${ref.to}` : '')
                : ref.text,
            ),
          ]),
        ),
      },
    })),
  }
}
export function sortRange(
  sheet: Sheet,
  a: Point,
  b: Point,
  column: number,
  descending: boolean,
  header: boolean,
  values: Record<string, CellValue>,
): Sheet {
  rangePoints(a, b)
  const top = Math.min(a.row, b.row) + Number(header),
    bottom = Math.max(a.row, b.row),
    left = Math.min(a.column, b.column),
    right = Math.max(a.column, b.column)
  if (column < left || column > right || top > bottom) throw validation('Choose a sort column inside the selected range')
  const compare = (a: CellValue = '', b: CellValue = '') => {
    if (a === '' || isCellError(a)) return b === '' || isCellError(b) ? 0 : 1
    if (b === '' || isCellError(b)) return -1
    const difference = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true })
    return descending ? -difference : difference
  }
  const rows = Array.from({ length: bottom - top + 1 }, (_, i) => top + i).sort((a, b) =>
    compare(values[address({ row: a, column })], values[address({ row: b, column })]),
  )
  const cells = { ...sheet.cells },
    formats = { ...sheet.formats }
  rows.forEach((source, i) => {
    const destination = top + i
    for (let column = left; column <= right; column++) {
      const from = address({ row: source, column }),
        to = address({ row: destination, column })
      const raw = shiftFormula(sheet.cells[from] ?? '', destination - source, 0)
      if (raw) cells[to] = raw
      else delete cells[to]
      if (sheet.formats?.[from]) formats[to] = sheet.formats[from]
      else delete formats[to]
    }
  })
  return { ...sheet, cells, ...(sheet.formats ? { formats } : {}) }
}

export function autofill(sheet: Sheet, a: Point, b: Point, target: Point): Sheet {
  rangePoints(a, b)
  const top = Math.min(a.row, b.row),
    bottom = Math.max(a.row, b.row),
    left = Math.min(a.column, b.column),
    right = Math.max(a.column, b.column)
  const vertical = target.row < top || target.row > bottom
  const from = { row: vertical ? Math.min(top, target.row) : top, column: vertical ? left : Math.min(left, target.column) }
  const to = { row: vertical ? Math.max(bottom, target.row) : bottom, column: vertical ? right : Math.max(right, target.column) }
  const cells = { ...sheet.cells },
    formats = { ...sheet.formats }
  const series = new Map<number, { first: number; step: number } | null>()
  const numeric = (value: string) => value.trim() !== '' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) && Number.isFinite(Number(value))
  const length = vertical ? bottom - top + 1 : right - left + 1
  for (const lane of Array.from({ length: vertical ? right - left + 1 : bottom - top + 1 }, (_, i) => i + (vertical ? left : top))) {
    const inputs = Array.from(
      { length },
      (_, i) => sheet.cells[address({ row: vertical ? top + i : lane, column: vertical ? lane : left + i })] ?? '',
    )
    const first = Number(inputs[0]),
      step = length > 1 ? Number(inputs[1]) - first : 1
    series.set(
      lane,
      inputs.every((value, i) => numeric(value) && Math.abs(Number(value) - first - i * step) <= 1e-10 * Math.max(1, Math.abs(Number(value))))
        ? { first, step }
        : null,
    )
  }
  for (const point of rangePoints(from, to)) {
    if (point.row >= top && point.row <= bottom && point.column >= left && point.column <= right) continue
    const offset = vertical ? point.row - top : point.column - left
    const source = {
      row: vertical ? top + (((offset % length) + length) % length) : point.row,
      column: vertical ? point.column : left + (((offset % length) + length) % length),
    }
    const sourceKey = address(source),
      key = address(point),
      raw = sheet.cells[sourceKey] ?? ''
    const progression = series.get(vertical ? point.column : point.row)
    let value: string
    if (progression) {
      value = String(Number((progression.first + offset * progression.step).toPrecision(15)))
      if (!Number.isFinite(Number(value))) throw validation('The series exceeds the supported number range')
    } else value = shiftFormula(raw, point.row - source.row, point.column - source.column)
    if (value) cells[key] = value
    else delete cells[key]
    if (sheet.formats?.[sourceKey]) formats[key] = sheet.formats[sourceKey]
    else delete formats[key]
  }
  return { ...sheet, cells, ...(Object.keys(formats).length ? { formats } : {}) }
}
