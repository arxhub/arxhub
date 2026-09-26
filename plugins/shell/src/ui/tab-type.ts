import type { ActionItem } from '@arxhub/uikit/core'
import type { Component } from 'vue'

// What survives a restart. The workspace is written to the device as a JSON string, so everything a
// type puts into its snapshot has to be data rather than an object with methods: a day later the
// other side gets the result of JSON.parse and nothing more.
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

// A reference to an object — how its type recognises it. What `id` means is known only to the type
// itself: for a note it is a path, for a track an identifier in the library. There is exactly one
// requirement on `id`, and it is a hard one: it is stable, because the type has to derive a stable
// `key` for the opened object from it (see `ObjectsRole.open`).
export interface ObjectRef {
  id: string
  // Where inside the object. A type is free to ignore it: a note can open at a block, a track cannot.
  at?: Json
}

// An opened object IS the tab. The component comes from the object, not from a viewer registry owned
// by the shell: the viewer registry belongs to the type, and the shell has no business knowing what
// opens a `.md`.
export interface OpenedObject {
  // The tab's key within its type. Two openings of one object must produce the same string — the
  // "already open" de-duplication rests on it.
  key: string
  title: string
  component: Component
  props: Record<string, unknown>
  // Save while the view is still mounted; false keeps the tab open and the owner reports why.
  beforeClose?(): Promise<boolean>
  // What to write into the workspace. Exactly this comes back to `revive` after a restart.
  snapshot(): Json
}

// What `revive` answers when the object is no longer there: the file was renamed, or deleted from
// another device. Deliberately empty — the wording comes from `Workspace`, one for every type. The
// type reports the fact, not the text.
export interface ObjectGone {
  readonly gone: true
}

export const objectGone: ObjectGone = Object.freeze({ gone: true })

export function isObjectGone(result: OpenedObject | ObjectGone): result is ObjectGone {
  return (result as ObjectGone).gone === true
}

export interface ObjectLabel {
  title: string
  subtitle?: string
}

// The role "objects open inside this type". These three operations are everything the shell needs to
// know about a type's objects; it knows nothing about files, paths or extensions.
export interface ObjectsRole {
  // Open an object by reference. Must be idempotent: two calls with one reference give an object with
  // the same `key`. Callers neither need nor may check "is it already open" — that check lives in one
  // place, in `Workspace.openObject`.
  open(ref: ObjectRef): Promise<OpenedObject>
  // Raise an object from a workspace snapshot. The object may be gone by now — then `objectGone`, and
  // the tab stays, marked, instead of disappearing silently.
  revive(snapshot: Json): Promise<OpenedObject | ObjectGone>
  label(object: OpenedObject): ObjectLabel
}

// A type's navigation: the vault tree, a list of albums, the sections of settings. Not a tab — it is
// neither opened nor closed, it has two presentations (a column on desktop, a panel on top on the
// phone) and one identity.
export interface TabTypeNav {
  component: Component
  title?: string
  icon?: string
  // The key the column's width and collapsed state are remembered under. Defaults to the type id:
  // width is remembered per type.
  widthKey?: string
}

// Creating an object. A type with nothing to create (a player) does not declare the role — and there
// is no button: a missing role is not masked by a dead control.
export interface TabTypeCreate {
  title: string
  icon?: string
  run(): void | Promise<void>
}

// The role "what is open" — separate from tabs. For a player that is the queue: forty tracks, one of
// which is open. You cannot derive that from the contents of a panel store without lying.
export interface TabTypeOpen {
  title: string
  // A count of the type's own instead of the number of tabs. Not declared — tabs are counted.
  //
  // This is what "forty tracks in the queue is not forty tabs" rests on. BOTH frames read it, and it
  // has a meaningful default, so it stays even though the product has no producer for it yet.
  count?: () => number
  // There is no `layer` field here. A type could declare its own presentation of what is open, but
  // exactly one frame ever read it: on desktop the second level is drawn by the panel layout, and
  // there is no room there for someone else's component. A type that declared a layer got a correct
  // phone and a silently ignored desktop — a divergence in MEANING, not in layout.
  //
  // It comes back together with the first producer, and with a decision covering both frames at once.
}

// One part of a composite object: a sheet of a workbook, a page of a PDF, a file of an AI proposal. A plain
// document has none — its name is a label, not a road — so the role exists only where there is something
// to choose between.
export interface ObjectBarPart {
  id: string
  title: string
  subtitle?: string
  // Icon spec string resolved by uikit's Icon registry. Unset — the bar's own icon.
  icon?: string
  selected?: boolean
  tone?: 'neutral' | 'danger'
}

export interface ObjectBarParts {
  // The heading of the sheet the name opens: "Sheets", "Pages", "Files".
  title: string
  items: ObjectBarPart[]
  pick(id: string): void
  // A row after the parts that makes a new one ("New sheet"). Unset — the sheet only chooses.
  add?: ActionItem
}

// The band above the phone's type row, described as DATA rather than drawn by the type. One component draws
// every type's band (MobileObjectBar), so two types that describe the same thing get the same band — a
// component per type is how five bottom bars with five geometries came about.
//
// Read on every render, so whatever it reads must be reactive; a plain variable answers once.
export interface ObjectBar {
  // "Where I am": the open object, or the place the type stands in when nothing is open ("Vault").
  icon: string
  name: string
  // A second, quieter half of the name: the active sheet, the current period, "3 of 7".
  sub?: string
  // Present only for a composite object: the name then carries a chevron and opens the list of parts.
  parts?: ObjectBarParts
  // Keys while they fit, in priority order; the trailing ones move into More first (OverflowActions).
  actions?: ActionItem[]
  // Only ever in More, after whatever overflowed. Destructive ones last, with `tone: 'danger'`.
  menu?: ActionItem[]
  // What takes the band while the on-screen keyboard is up — the active editor's editing toolbar, undo and
  // redo first. Unset — the band stays as described while typing.
  editing?: Component
}

// What a second tap on the active type opens — the way a tab counter in a phone's browser opens the tabs.
// Every field is optional because the shell has a default for each: an object type lists its tabs, oldest
// at the top and the freshest under the thumb, followed by a road into its `nav`; a type without objects
// shows its `nav` in the sheet. A type overrides only what it knows better.
//
// The components are mounted inside the shell's own sheet and get one prop, `typeId`. A component that
// has done its job — a month was picked, a section chosen — closes the sheet through
// `useNavHost().navigated()`, the same call a navigation already makes on the desktop.
export interface TabTypeSheet {
  // Defaults to the type's own title.
  title?: string
  // Replaces the default body: the months of Budget, the sessions of AI.
  content?: Component
  // Pinned under the body, above the keyboard: the Documents' "Find a document…" field.
  footer?: Component
  // Where the sheet opens scrolled to. Defaults to `end` for the tab list — the freshest tab is the one the
  // sheet was raised for — and to `start` for everything else.
  anchor?: 'start' | 'end'
}

interface TabTypeBase {
  id: string
  // Icon spec string resolved by uikit's Icon registry.
  icon: string
  title: string
  order?: number
  nav?: TabTypeNav
  create?: TabTypeCreate
  open?: TabTypeOpen
  // The band above the phone's type row. Declared by the type once; what it says is decided by the active
  // object, which is the argument (null while nothing is open, and always null for a type without
  // objects). Not declared, or null — no band: an empty one would spend 48px of the shortest screen.
  bar?: (active: OpenedObject | null) => ObjectBar | null
  sheet?: TabTypeSheet
  // By default a type is pinned and holds a place in the row. `pinned: false` — it does not, but it
  // must appear in the "open new" section of the search sheet: there are no unreachable types.
  pinned?: boolean
}

// A type either opens objects or is its own content. This is a sum, not two fields with a boolean
// beside them: the state "both are set" must not be expressible, or the shell would have to choose on
// the type author's behalf which of the two to show.
export type ObjectTabType = TabTypeBase & { objects: ObjectsRole; content?: never }
export type ContentTabType = TabTypeBase & { content: Component; objects?: never }
export type TabType = ObjectTabType | ContentTabType

export function isObjectType(type: TabType): type is ObjectTabType {
  return (type as ObjectTabType).objects != null
}

export function isPinned(type: TabType): boolean {
  return type.pinned !== false
}
