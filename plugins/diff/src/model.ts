// The format-neutral answer of a differ. Every view draws one of these four shapes and never learns which
// format produced it; a format owner translates its own document into blocks, lines or cells.

export type ChangeKind = 'added' | 'removed' | 'changed' | 'moved'
export type UnitChange = 'equal' | ChangeKind

// Only a 'changed' unit (or a paired line) carries 'removed'/'added' segments. Anything else carries its plain
// text as one 'equal' segment: its tint already says added/removed, and <ins> inside a green block says it twice.
export interface InlineSegment {
  kind: 'equal' | 'removed' | 'added'
  text: string
}

// A move counts as `changed` (the "~" of the summary). The summary and the navigation count the same stops, so
// added + removed + changed === stops.length for every model a differ returns.
export interface DiffCounts {
  added: number
  removed: number
  changed: number
}

export interface DiffStop {
  index: number
  // The unit, line or cell the view marks as data-diff-stop="<target>".
  target: string
  change: ChangeKind
  // A format-owned handle a host can act on (arx: the key of a top-level block, which the history restores).
  ref?: string
  tabId?: string
}

interface StopModelBase {
  stops: readonly DiffStop[]
  counts: DiffCounts
  identical: boolean
}

export type BlockRole = 'paragraph' | 'heading' | 'task' | 'item' | 'code' | 'row' | 'other'

export interface DiffMove {
  direction: 'up' | 'down'
  distance: number
}

export interface DiffBlock {
  kind: 'block'
  id: string
  change: UnitChange
  role: BlockRole
  level?: number
  // The task state on the side this unit shows: after, or before for a removed unit or a ghost.
  checked?: boolean
  checkedBefore?: boolean
  segments: InlineSegment[]
  // An attribute change said in words ('задача отмечена', 'абзац → заголовок'), because a tint cannot say it.
  note?: string
  move?: DiffMove
  // The OLD place of a moved unit: hidden in the stream, drawn on the left of the side-by-side view.
  ghost?: boolean
  stop?: number
}

export interface DiffContainer {
  kind: 'container'
  id: string
  // 'changed' only when matched on both sides and recursed — then the children carry the stops and the container
  // is none. An added, removed or moved container is one unit with one stop on itself.
  change: UnitChange
  label: string
  summary: string
  head?: DiffBlock
  children: DiffUnit[]
  note?: string
  move?: DiffMove
  ghost?: boolean
  stop?: number
}

export type DiffUnit = DiffBlock | DiffContainer

export interface DiffBlocksModel extends StopModelBase {
  format: 'blocks'
  units: DiffUnit[]
}

export interface DiffLine {
  id: string
  change: 'equal' | 'added' | 'removed'
  oldNumber?: number
  newNumber?: number
  segments: InlineSegment[]
  // Inside one change run removed[i] pairs with added[i]; a pair is ONE 'changed' stop, set on the removed line.
  pair?: string
  // What the words cannot show, said in words (a changed line ending).
  note?: string
  stop?: number
}

export interface DiffTextModel extends StopModelBase {
  format: 'text'
  lines: DiffLine[]
}

export interface DiffCellChange {
  address: string
  row: number
  column: number
  change: 'added' | 'removed' | 'changed'
  before?: string
  after?: string
  caption: string | null
  stop: number
}

export interface DiffGridCell {
  value: string
  change?: 'added' | 'removed' | 'changed'
  before?: string
  stop?: number
}

export interface DiffSheetGrid {
  rows: number
  columns: number
  cells: Readonly<Record<string, DiffGridCell>>
  changedRows: readonly number[]
}

export interface DiffCellGroup {
  row: number
  context: string
  cells: DiffCellChange[]
}

export type SheetStatus = 'equal' | 'changed' | 'added' | 'removed' | 'renamed'

export interface DiffSheetTab {
  id: string
  name: string
  previousName?: string
  status: SheetStatus
  filled: { before: number; after: number }
  grid: DiffSheetGrid
  groups: DiffCellGroup[]
  stops: DiffStop[]
  counts: DiffCounts
  // A change no cell shows (formats, widths, freeze panes), said in words: it is not a stop, but the sheet did change.
  note?: string
}

export interface DiffSheetModel {
  format: 'sheets'
  tabs: DiffSheetTab[]
  initialTab: string
  counts: DiffCounts
  identical: boolean
  // A change of the workbook itself (sheet order, the active sheet), said in words for the same reason.
  note?: string
}

export interface DiffReplacedModel extends StopModelBase {
  format: 'replaced'
  left: { bytes: number; preview: string }
  right: { bytes: number; preview: string }
}

export type DiffModel = DiffBlocksModel | DiffTextModel | DiffSheetModel | DiffReplacedModel

export interface DiffResult {
  pathname: string
  leftLabel: string
  rightLabel: string
  differ: string
  model: DiffModel
  // The raw text diff behind «Показать JSON». Null when the answer already is the text or binary one, or when
  // either side does not decode.
  source(): DiffTextModel | null
}
