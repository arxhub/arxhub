import type { WorkspaceEmit, WorkspaceEvents } from './nav-events'
import type { Json } from './tab-type'
import type { Workspace, WorkspaceState } from './workspace'

// The narrow slice of `Storage` this needs. Named rather than taken as `Storage` so a test can hand
// over a map and a non-browser bundle can hand over nothing at all.
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const WORKSPACE_KEY = 'arxhub.workspace'

// Where a record of a foreign version is put before it is overwritten. Without it, rolling back to a
// previous build and forward again erased the desk TWICE and without a trace: a version mismatch read
// as "a clean slate", and the first save then overwrote what could not be read. If forgetting the desk
// counts as an emergency exit here, it has to have a way back.
export const WORKSPACE_BACKUP_KEY = 'arxhub.workspace.bak'
export const WORKSPACE_VERSION = 1

// Exactly what survives a restart, and there is nothing else. No layer is in here and none can be: a
// sheet, a dialog, the search sheet, a menu and a toast are never written and never revived — a dialog
// that surfaces a day later is a ghost, not restored state. That is a property of the record rather
// than a rule someone has to remember, and it holds at both ends. Writing: this is the only shape
// `save` builds, and there is no slot to put a layer in. Reading: `restore` reads these four fields by
// name, so a field a future build (or a hand edit) adds to the JSON never reaches the application.
//
// The workspace state itself is the same shape at its own level — `TypeState` is types, tabs and a
// layout, and a layer is not expressible as any of them.
interface WorkspaceRecord {
  v: number
  workspace: WorkspaceState
  // A type's navigation state: expanded folders, the selected section, the chosen period. It is
  // written by the OWNER of that navigation — the plugin — and only the plugin knows the shape inside.
  nav: Record<string, Json>
  // The geometry of the navigation column, by the type's own key: width and collapsed state.
  // Deliberately separate from `nav`. There the owner is the plugin, here it is the frame, and keeping
  // two states with different owners in one field means overwriting someone else's one day:
  // `setNav(typeId, {...})` from a plugin would carry off the width a person set by hand.
  column: Record<string, ColumnState>
}

// The geometry of the navigation column. Written by the frame, read by the frame; the plugin never
// sees it.
export interface ColumnState {
  width?: number
  collapsed?: boolean
}

// The events a save is worth. Every one of them is a person's work, and each unit of it deserves a
// record. There is no layer event to add here even if someone wanted to — `WorkspaceEvents` has none.
const WATCHED: ReadonlySet<keyof WorkspaceEvents> = new Set<keyof WorkspaceEvents>([
  'workspace:type-opened',
  'workspace:type-closed',
  'workspace:type-activated',
  'workspace:object-opened',
  'workspace:object-closed',
  'workspace:object-activated',
  'workspace:object-gone',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

// The bounds of the navigation column's width. Narrower than the minimum it stops fitting file names
// and becomes a strip of ellipses; wider than the maximum it eats the content it was opened for.
export const COLUMN_MIN = 180
export const COLUMN_MAX = 560

export function clampColumnWidth(width: number): number {
  return Math.min(COLUMN_MAX, Math.max(COLUMN_MIN, Math.round(width)))
}

function sanitizeColumns(raw: Record<string, unknown>): Record<string, ColumnState> {
  const out: Record<string, ColumnState> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (!isRecord(value)) continue
    const state: ColumnState = {}
    if (typeof value.width === 'number' && Number.isFinite(value.width)) state.width = clampColumnWidth(value.width)
    if (typeof value.collapsed === 'boolean') state.collapsed = value.collapsed
    out[key] = state
  }
  return out
}

export interface WorkspaceStorageOptions {
  workspace: Workspace
  // Defaults to the browser's `localStorage`, and to memory where there is none.
  storage?: StorageLike
  key?: string
}

// The third channel of state in the application, and calling it a subsystem is deliberate. The two
// that exist — `PluginConfig` (TOML in the vault, synced) and a scattering of `localStorage` with no
// shared contract — are both wrong for this: a layout on a laptop and a layout on a phone are
// different by their nature, so it does not sync; and without a shared contract it would become the
// sixth scattering.
//
// Device-local, versioned, and on a version mismatch it starts from a clean slate — silently.
export class WorkspaceStorage {
  private readonly workspace: Workspace
  private readonly storage: StorageLike
  private readonly key: string
  private attached = true

  private nav: Record<string, Json> = {}
  private column: Record<string, ColumnState> = {}
  // While a restore is running there is nothing to write: a restore is not a person's work, and half a
  // restored desk landing on disk is worse than the whole of it.
  private restoring = false

  constructor(options: WorkspaceStorageOptions) {
    this.workspace = options.workspace
    this.storage = options.storage ?? browserStorage()
    this.key = options.key ?? WORKSPACE_KEY
  }

  // Hand this to `Workspace`'s `emit`. It is a `WorkspaceEmit` rather than a bus subscription because
  // the shell package does not depend on `@arxhub/events` yet (see `nav-events.ts`) — the day it does,
  // this becomes `bus.on(event, …)` for each of `WATCHED` and nothing else changes.
  readonly observe: WorkspaceEmit = (event) => {
    if (this.attached && WATCHED.has(event)) this.save()
  }

  navOf(typeId: string): Json {
    return this.nav[typeId] ?? null
  }

  setNav(typeId: string, value: Json): void {
    this.nav[typeId] = value
    this.save()
  }

  // The navigation column's geometry, in a slot of its own rather than in `nav`. The key is not
  // necessarily a type id: a type may declare a shared `widthKey`, and then two types share one width.
  columnOf(key: string): ColumnState {
    return this.column[key] ?? {}
  }

  // By merging, not by replacing: width and collapsed state are set by different actions of a person,
  // and writing one of them must not forget the other.
  setColumn(key: string, patch: ColumnState): void {
    this.column[key] = { ...this.column[key], ...patch }
    this.save()
  }

  save(): boolean {
    if (this.restoring) return false
    const record: WorkspaceRecord = {
      v: WORKSPACE_VERSION,
      workspace: this.workspace.serialize(),
      nav: this.nav,
      column: this.column,
    }
    // Storage may be absent (not a browser) or refuse (private mode, a sandbox, out of quota). Then we
    // work without a memory — but we work.
    try {
      this.storage.setItem(this.key, JSON.stringify(record))
      return true
    } catch {
      // No room — the desk lives for this session only.
      return false
    }
  }

  // Answers whether there was anything to restore. `false` is a first run or a record that cannot be
  // read; both of those mean a clean desk, not an error.
  async restore(): Promise<boolean> {
    let raw: string | null
    try {
      raw = this.storage.getItem(this.key)
    } catch {
      return false
    }
    if (raw == null || raw === '') return false

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return false
    }
    if (!isRecord(parsed) || parsed.v !== WORKSPACE_VERSION) {
      this.keepAside(raw)
      return false
    }

    const state = parsed.workspace
    // Accepting a record is all or nothing. Laying the fields out on the instance BEFORE this check
    // meant that on a malformed workspace `restore` answered "clean desk" while the columns and the
    // navigation state from that same record were already in memory and went back to disk on the first
    // save: half a rejected record survived.
    if (!isRecord(state) || !Array.isArray(state.types)) {
      this.keepAside(raw)
      return false
    }

    // The fields are read one at a time: a person may have edited the record, or a previous build wrote
    // it, and one value nobody understands must not cost the rest.
    this.nav = isRecord(parsed.nav) ? (parsed.nav as Record<string, Json>) : {}
    // The width is clamped on READ, not only on write: the record may hold anything — a width from a
    // previous version of the application, from another monitor, or a negative number typed into
    // devtools. A column −40px wide must not be expressible after a restart.
    this.column = isRecord(parsed.column) ? sanitizeColumns(parsed.column) : {}

    this.restoring = true
    try {
      await this.workspace.restore({
        activeTypeId: typeof state.activeTypeId === 'string' ? state.activeTypeId : null,
        types: state.types as WorkspaceState['types'],
      })
    } finally {
      this.restoring = false
    }
    return true
  }

  // Forget the desk. An emergency exit of the same kind as resetting the boot policy: when the record
  // itself is at fault, there has to be a way to throw it away.
  forget(): void {
    this.nav = {}
    // And the column geometry: without this, "forget the desk" left it in memory and the first save put
    // it back on disk — an emergency exit that half worked, silently.
    this.column = {}
    try {
      this.storage.removeItem(this.key)
    } catch {
      // Nothing to forget.
    }
  }

  // Stop saving. The workspace may keep announcing — nothing here writes it down any more.
  detach(): void {
    this.attached = false
  }

  // A record that could not be read is put aside rather than vanishing. A refusal to put it aside is
  // not a reason to fail to start: the room may have run out on exactly this.
  private keepAside(raw: string): void {
    try {
      this.storage.setItem(WORKSPACE_BACKUP_KEY, raw)
    } catch {
      // It did not fit — the record is lost, and there is nothing left to do about it.
    }
  }
}

function browserStorage(): StorageLike {
  if (typeof localStorage !== 'undefined') return localStorage
  // Not a browser (a server build, a test without an environment): memory for the life of the process.
  const entries = new Map<string, string>()
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value)
    },
    removeItem: (key) => {
      entries.delete(key)
    },
  }
}
