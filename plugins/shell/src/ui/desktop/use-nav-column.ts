import { type Ref, ref } from 'vue'
import { COLUMN_MAX, COLUMN_MIN, clampColumnWidth, type WorkspaceStorage } from '../workspace-storage'

// The bounds live in the storage layer, not here: a width is clamped on READ as well as on write, or a
// value from another monitor, an older build or devtools would survive a restart. The lower bound is
// deliberately not zero — zero is not a narrow column, it is a collapsed one, and collapsed has its own
// state and its own way back. Clamping to a range with no zero in it is exactly why the rail this
// replaces could not be collapsed at all, only dragged down to RAIL_MIN.
export const NAV_MIN = COLUMN_MIN
export const NAV_MAX = COLUMN_MAX
export const NAV_DEFAULT = 280

// The width and the collapsed state of the navigation column, remembered per type (F-15). Successor to
// `use-rail-width.ts`: the idea that a width lives under a key and survives a restart is the same, but
// the scattering of `arxhub.rail.*` in localStorage is gone — the desk is written by one subsystem, in
// one record.
export interface NavColumn {
  readonly key: string
  readonly width: Ref<number>
  readonly collapsed: Ref<boolean>
  setWidth(value: number): void
  toggle(): void
}

// One state per key per storage. One key, one column: two types sharing a `widthKey` share a width,
// which is the whole reason `widthKey` exists.
const columns = new WeakMap<WorkspaceStorage, Map<string, NavColumn>>()

export function navColumn(storage: WorkspaceStorage, key: string): NavColumn {
  let byKey = columns.get(storage)
  if (byKey == null) {
    byKey = new Map()
    columns.set(storage, byKey)
  }
  const existing = byKey.get(key)
  if (existing != null) return existing

  // The `column` slot, not `nav`. In `nav` a plugin keeps its OWN navigation state — expanded folders,
  // the chosen section — and owns it. The geometry of the column is set by a person through the frame.
  // Two states with different owners in one field overwrite each other sooner or later: it takes one
  // plugin writing `setNav` as a replacement for a hand-set width to disappear.
  const saved = storage.columnOf(key)
  const width = ref(saved.width ?? NAV_DEFAULT)
  const collapsed = ref(saved.collapsed === true)

  const column: NavColumn = {
    key,
    width,
    collapsed,
    setWidth(value: number): void {
      const next = clampColumnWidth(value)
      if (next === width.value) return
      width.value = next
      storage.setColumn(key, { width: next })
    },
    toggle(): void {
      collapsed.value = !collapsed.value
      storage.setColumn(key, { collapsed: collapsed.value })
    },
  }
  byKey.set(key, column)
  return column
}
