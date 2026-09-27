import { t } from '../i18n/messages'
import type { DiffMove, SheetStatus } from '../model'

// The composed phrases of the diff UI, in one place: both frames and the band read the same answer. Each reads
// the language when called, so a template or computed calling one follows a switch.

export function zoomLabels(): { out: string; in: string; reset: string } {
  return { out: t('zoomOut'), in: t('zoomIn'), reset: t('zoomReset') }
}

export function positionLabel(current: number, total: number): string {
  return t('position', { current: current + 1, total })
}

export function changesLabel(n: number): string {
  return t('changes', { count: n })
}

export type FoldUnit = 'blocks' | 'lines' | 'items' | 'rows'

export function foldLabel(count: number, unit: FoldUnit): string {
  return t(`fold.${unit}`, { count })
}

export const foldBlocksLabel = (count: number): string => foldLabel(count, 'blocks')
export const foldLinesLabel = (count: number): string => foldLabel(count, 'lines')

// Rows are named by their sheet numbers, since a grid reader looks for "rows 12–40" in the row header.
export function rowGapLabel(first: number, last: number): string {
  return first === last ? t('rowGap.single', { row: first + 1 }) : t('rowGap.range', { first: first + 1, last: last + 1 })
}

// The live unit on the right of the side-by-side view says where it came from; its ghost on the left carries the
// differ's own note ('was here · moved up').
export function movedHereLabel(move: DiffMove | undefined): string {
  if (move == null) return t('moved.here')
  return t(move.direction === 'up' ? 'moved.hereFromBelow' : 'moved.hereFromAbove', { count: move.distance })
}

// The stream's word for a block that was moved and edited at once; a pure move carries the differ's own note.
export function movedLabel(move: DiffMove | undefined): string {
  if (move == null) return t('moved.plain')
  return t(move.direction === 'up' ? 'moved.up' : 'moved.down', { count: move.distance })
}

export function sheetAddedLabel(filled: number): string {
  return t('sheet.added', { count: filled })
}

export function sheetRemovedLabel(filled: number): string {
  return t('sheet.removed', { count: filled })
}

export function sheetRenamedLabel(before: string, after: string): string {
  return t('sheet.renamed', { before, after })
}

export function rowGroupLabel(row: number, context: string): string {
  return context === '' ? t('sheet.row', { row: row + 1 }) : t('sheet.rowWithContext', { row: row + 1, context })
}

export function bytesLabel(n: number): string {
  return t('bytes', { count: n })
}

// What the strip's and the band's counter say: nothing without changes, the total before a first step, then the
// position.
export function counterLabel(current: number, total: number): string {
  if (total === 0) return ''
  return current < 0 ? changesLabel(total) : positionLabel(current, total)
}

// A sheet's line in the phone's parts sheet: its status when it came or went as a whole, else its changes.
export function sheetPartMeta(status: SheetStatus, changes: number): string {
  if (status === 'added') return t('part.added')
  if (status === 'removed') return t('part.removed')
  if (status === 'renamed') return t('part.renamed')
  return changes > 0 ? changesLabel(changes) : t('part.unchanged')
}
