import type { DiffMove, SheetStatus } from '../model'
import { pluralRu } from '../stops'

// Every word the diff UI says, in one place: both frames and the band read the same answer.
export const DIFF_LABELS = {
  stream: 'Лента',
  side: 'Рядом',
  layout: 'Вид сравнения',
  list: 'Список',
  grid: 'Сетка',
  view: 'Вид',
  onlyChangedRows: 'только изменённые строки',
  showSource: 'Показать JSON',
  showDiff: 'Показать сравнение',
  showSide: 'Показать рядом',
  showStream: 'Показать лентой',
  openDocument: 'Открыть документ',
  more: 'Ещё',
  menuTitle: 'Сравнение',
  previous: 'Предыдущая правка · Alt+↑',
  next: 'Следующая правка · Alt+↓',
  previousTitle: 'Предыдущая правка',
  nextTitle: 'Следующая правка',
  identical: 'Версии совпадают — изменений нет',
  noChangesOnSheet: 'На этом листе изменений нет',
  noValueChangesOnSheet: 'Значения ячеек не изменились',
  sheets: 'Листы',
  noCaption: 'без заголовка',
  zoom: 'Масштаб',
  zoomHint: 'или щипок двумя пальцами',
  zoomOut: 'Уменьшить',
  zoomIn: 'Увеличить',
  zoomReset: 'Сбросить масштаб',
  disabled: 'Сравнение выключено: включите плагин Diff',
  failed: 'Не удалось сравнить версии',
  binary: 'Файл не текстовый — показаны размеры и начало обеих версий',
} as const

export const ZOOM_LABELS = { out: DIFF_LABELS.zoomOut, in: DIFF_LABELS.zoomIn, reset: DIFF_LABELS.zoomReset }

export function positionLabel(current: number, total: number): string {
  return `${current + 1} из ${total}`
}

export function changesLabel(n: number): string {
  return `${n} ${pluralRu(n, 'правка', 'правки', 'правок')}`
}

export type FoldUnit = 'blocks' | 'lines' | 'items' | 'rows'

const FOLD_NOUNS: Record<FoldUnit, [string, string, string]> = {
  blocks: ['блок', 'блока', 'блоков'],
  lines: ['строка', 'строки', 'строк'],
  items: ['пункт', 'пункта', 'пунктов'],
  rows: ['строка', 'строки', 'строк'],
}

export function foldLabel(count: number, unit: FoldUnit): string {
  const [one, few, many] = FOLD_NOUNS[unit]
  return `${count} ${pluralRu(count, one, few, many)} без изменений`
}

// Rows are named by their sheet numbers, since a grid reader looks for "строки 12–40" in the row header.
export function rowGapLabel(first: number, last: number): string {
  return first === last ? `строка ${first + 1} без изменений` : `строки ${first + 1}–${last + 1} без изменений`
}

// The live unit on the right of the side-by-side view says where it came from; its ghost on the left carries the
// differ's own note ('было здесь · перемещён выше').
export function movedHereLabel(move: DiffMove | undefined): string {
  if (move == null) return 'перемещён сюда'
  const where = move.direction === 'up' ? 'ниже' : 'выше'
  return `перемещён сюда · было на ${move.distance} ${pluralRu(move.distance, 'блок', 'блока', 'блоков')} ${where}`
}

// The stream's word for a block that was moved and edited at once; a pure move carries the differ's own note.
export function movedLabel(move: DiffMove | undefined): string {
  if (move == null) return 'перемещён'
  const where = move.direction === 'up' ? 'выше' : 'ниже'
  return `перемещён ${where} на ${move.distance} ${pluralRu(move.distance, 'блок', 'блока', 'блоков')}`
}

function filledCells(n: number): string {
  return `${n} ${pluralRu(n, 'заполненная ячейка', 'заполненные ячейки', 'заполненных ячеек')}`
}

export function sheetAddedLabel(filled: number): string {
  return `Лист добавлен · ${filledCells(filled)}`
}

export function sheetRemovedLabel(filled: number): string {
  return `Лист удалён · было ${filledCells(filled)}`
}

export function sheetRenamedLabel(before: string, after: string): string {
  return `Лист переименован: «${before}» → «${after}»`
}

export function rowGroupLabel(row: number, context: string): string {
  return context === '' ? `Строка ${row + 1}` : `Строка ${row + 1} · ${context}`
}

export function bytesLabel(n: number): string {
  return `${n} ${pluralRu(n, 'байт', 'байта', 'байт')}`
}

// What the strip's and the band's counter say: nothing without changes, the total before a first step, then the
// position.
export function counterLabel(current: number, total: number): string {
  if (total === 0) return ''
  return current < 0 ? changesLabel(total) : positionLabel(current, total)
}

// A sheet's line in the phone's parts sheet: its status when it came or went as a whole, else its changes.
export function sheetPartMeta(status: SheetStatus, changes: number): string {
  if (status === 'added') return 'лист добавлен'
  if (status === 'removed') return 'лист удалён'
  if (status === 'renamed') return 'лист переименован'
  return changes > 0 ? changesLabel(changes) : 'без изменений'
}

export const BAND_LABELS = {
  parts: 'Части сравнения',
  close: 'Закрыть',
  rows: 'Строки',
} as const
