import type { DiffLine, DiffUnit } from './model'

export type SideCell<T> = { kind: 'item'; item: T } | { kind: 'blank' }

export interface SideRow<T> {
  id: string
  left: SideCell<T>
  right: SideCell<T>
  changed: boolean
}

const blank = { kind: 'blank' } as const

function item<T>(value: T): SideCell<T> {
  return { kind: 'item', item: value }
}

// One row per unit, in the model's order. A moved unit is drawn twice: its ghost on the left at the old place,
// the live unit on the right at the new one, each opposite a blank — which is what makes a move readable in two
// columns without a connector line.
export function alignBlocks(units: readonly DiffUnit[]): SideRow<DiffUnit>[] {
  return units.map((unit) => {
    if (unit.ghost === true || unit.change === 'removed') return { id: unit.id, left: item(unit), right: blank, changed: true }
    if (unit.change === 'added' || unit.change === 'moved' || unit.move != null)
      return { id: unit.id, left: blank, right: item(unit), changed: true }
    return { id: unit.id, left: item(unit), right: item(unit), changed: unit.change !== 'equal' }
  })
}

// GitHub's zip: a pair shares one row, and whatever the longer side of a run has left over sits opposite blanks.
export function alignLines(lines: readonly DiffLine[]): SideRow<DiffLine>[] {
  const byId = new Map(lines.map((line) => [line.id, line]))
  const rows: SideRow<DiffLine>[] = []
  for (const line of lines) {
    if (line.change === 'equal') rows.push({ id: line.id, left: item(line), right: item(line), changed: false })
    else if (line.change === 'removed') {
      const partner = line.pair == null ? undefined : byId.get(line.pair)
      rows.push({ id: line.id, left: item(line), right: partner == null ? blank : item(partner), changed: true })
    } else if (line.pair == null || !byId.has(line.pair)) rows.push({ id: line.id, left: blank, right: item(line), changed: true })
  }
  return rows
}
