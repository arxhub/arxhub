import type { Json } from '@arxhub/plugin-shell/ui'

// An address of a place inside a note. It is the TEXT that matched, not an ordinal: `${path}#${n}`
// goes stale the moment a paragraph is inserted above it, so an address handed over by search already
// points somewhere else by the time it is clicked. Text survives an edit to its neighbours and finds
// itself again.
//
// It lives here rather than beside the viewer registry because search builds it and the type reads it,
// and neither of them needs an editor component. A module with no `.vue` in it is also the only way to
// keep this unit-tested.
export interface BlockAnchor {
  // What matched the query. Its bounds come from `snippetSegments` in `@arxhub/sql`.
  text: string
  // A hint about which one: how many identical matches came before this one in the document. Zero is
  // the first. Not binding — if that many are not there, the first match is used.
  skip?: number
}

// The type's id. In a module of its own that imports no components: the explorer, search and the
// instance all name it, and importing the whole plugin with its viewers for the sake of one string
// would drag the editors into everything that merely opens a note.
export const NOTES_TYPE_ID = 'arxhub.notes'

// What the type puts into the workspace. The path and nothing else: a snapshot survives a restart as
// JSON, and everything else — title, viewer, position — is derived from the path again.
export interface NoteSnapshot {
  path: string
}

// The address comes from the index or from a saved link, so it is read as DATA rather than as an
// instruction: a malformed field must not cost the opening of the object.
export function blockAnchorOf(at: Json | undefined): BlockAnchor | null {
  if (at == null || typeof at !== 'object' || Array.isArray(at)) return null
  const record = at as Record<string, Json>
  const text = record.text
  if (typeof text !== 'string' || text.trim() === '') return null
  const skip = typeof record.skip === 'number' && Number.isFinite(record.skip) && record.skip > 0 ? Math.floor(record.skip) : undefined
  return skip == null ? { text } : { text, skip }
}

// A snapshot arrived from the previous session, which means from the previous build: it is read as
// data, not as a promise. Not understood — then there is simply no tab, which beats a restore that
// throws.
export function noteSnapshotPath(snapshot: Json): string | null {
  if (snapshot == null || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const path = (snapshot as Record<string, Json>).path
  return typeof path === 'string' && path !== '' ? path : null
}
