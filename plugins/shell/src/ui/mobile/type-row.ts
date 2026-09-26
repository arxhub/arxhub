import type { TypeRowItem } from '../workspace'

// Four keys and More fill a phone's row at a touch-sized width each (≥ 72px at 360); a fifth would put
// them under the minimum. A layout fact of this frame, not a preference someone would tune.
export const TYPE_ROW_KEYS = 4

export interface FittedTypeRow {
  readonly shown: TypeRowItem[]
  // How many open types did not get a key; More carries the number.
  readonly hidden: number
}

// The row keeps the order types were opened in and shows the first few. The active type is ALWAYS among
// them — the row answers "where am I" before anything else — so an active type that would be hidden takes
// the last key.
export function fitTypeRow(row: readonly TypeRowItem[], keys: number = TYPE_ROW_KEYS): FittedTypeRow {
  const shown = row.slice(0, keys)
  const active = row.find((item) => item.active)
  if (active != null && !shown.includes(active) && shown.length > 0) shown[shown.length - 1] = active
  return { shown, hidden: row.length - shown.length }
}
