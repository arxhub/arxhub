import type { FoldEntry } from '../fold'
import type { ChangeKind, DiffBlock, DiffUnit, InlineSegment, UnitChange } from '../model'
import type { FoldUnit } from './labels'
import { movedHereLabel, movedLabel } from './labels'

// null is the stream; 'left' / 'right' are the two columns of the side-by-side view.
export type BlockSide = 'left' | 'right' | null

// Which units a column draws. The stream shows the new document with removals left in place; the left column is
// the old document (its ghosts included, its additions and new places not), the right column the new one.
export function visibleOn(unit: DiffUnit, side: BlockSide): boolean {
  if (side == null) return unit.ghost !== true
  if (side === 'left') return unit.change !== 'added' && !relocated(unit)
  return unit.ghost !== true && unit.change !== 'removed'
}

// The live copy of a block that left its place — moved, or moved and edited. Its ghost holds the old place.
export function relocated(unit: DiffUnit): boolean {
  return unit.ghost !== true && (unit.change === 'moved' || unit.move != null)
}

export function shownChange(unit: DiffUnit): UnitChange {
  return unit.ghost === true ? 'moved' : unit.change
}

// A change is focusable once. In two columns that is the right-hand copy — except a removal, which has none.
export function stopHere(unit: DiffUnit, side: BlockSide): boolean {
  if (unit.stop == null || unit.ghost === true) return false
  return side !== 'left' || unit.change === 'removed'
}

// Each column reads as its own version: the old text on the left, the new on the right.
export function segmentsFor(segments: readonly InlineSegment[], side: BlockSide): readonly InlineSegment[] {
  if (side === 'left') return segments.filter((segment) => segment.kind !== 'added')
  if (side === 'right') return segments.filter((segment) => segment.kind !== 'removed')
  return segments
}

export function noteFor(unit: DiffUnit, side: BlockSide): string | undefined {
  if (side === 'right' && unit.change === 'moved' && unit.ghost !== true) return movedHereLabel(unit.move)
  // A block both moved and edited: the differ's note is the edit, the move is said here, per column.
  if (unit.change === 'changed' && relocated(unit)) {
    const where = side === 'right' ? movedHereLabel(unit.move) : movedLabel(unit.move)
    return unit.note == null ? where : `${where} · ${unit.note}`
  }
  // The right-hand copy of a changed unit already says what changed; saying it twice reads as two changes.
  if (side === 'left' && unit.change === 'changed' && unit.ghost !== true) return undefined
  return unit.note
}

export function checkedFor(block: DiffBlock, side: BlockSide): boolean | undefined {
  if (side === 'left' && block.change === 'changed') return block.checkedBefore ?? block.checked
  return block.checked
}

export function glyphFor(unit: DiffUnit): ChangeKind | 'container' | null {
  const change = shownChange(unit)
  if (change === 'equal') return null
  if (unit.kind === 'container' && change === 'changed') return 'container'
  return change
}

// A container that is itself the change (added, removed, moved) is one unit: its children take its tint.
export function wholeContainer(unit: DiffUnit): boolean {
  return unit.kind === 'container' && (unit.ghost === true || unit.change === 'added' || unit.change === 'removed' || unit.change === 'moved')
}

export function foldUnitOf(children: readonly DiffUnit[]): FoldUnit {
  if (children.length > 0 && children.every((child) => child.kind === 'block' && (child.role === 'item' || child.role === 'task')))
    return 'items'
  if (children.length > 0 && children.every((child) => child.kind === 'block' && child.role === 'row')) return 'rows'
  return 'blocks'
}

export function stopTargets(unit: DiffUnit, into: string[] = []): string[] {
  if (unit.stop != null && unit.ghost !== true) into.push(unit.id)
  if (unit.kind === 'container') {
    if (unit.head != null) stopTargets(unit.head, into)
    for (const child of unit.children) stopTargets(child, into)
  }
  return into
}

// target → fold id, for every stop a fold currently hides. Folding only ever hides unchanged units, so this is
// normally empty; it exists so a reveal never depends on that staying true.
export function hiddenTargets<T>(entries: readonly FoldEntry<T>[], items: readonly T[], targetsOf: (item: T) => string[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of entries) {
    if (entry.kind !== 'fold') continue
    for (let index = entry.start; index < entry.start + entry.count; index++)
      for (const target of targetsOf(items[index])) map.set(target, entry.id)
  }
  return map
}
