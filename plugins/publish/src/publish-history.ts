// What a head commit leaves behind. The manifest object itself is never deleted from the public store, so
// the hash alone is enough to make that state the head again — the rest is what a person needs to choose
// which one: when, what was public, how big, and whether it was a publish, a revocation or a return.
export type PublicationKind = 'publish' | 'unpublish' | 'rollback'

export interface PublicationRecord {
  hash: string
  // ISO 8601, the moment the head moved.
  at: string
  roots: string[]
  files: number
  kind: PublicationKind
}

// The schema's default, kept here rather than in the plugin so a Publisher built without a config (tests,
// another caller) rounds to the same number the settings page shows.
export const DEFAULT_HISTORY_LIMIT = 20

const KINDS: ReadonlySet<string> = new Set<PublicationKind>(['publish', 'unpublish', 'rollback'])

// The file is a file: another device wrote it, or an older build did. One entry that does not read as a
// record must not cost the rest, and must not become a row the page then offers to roll back to.
export function sanitizeHistory(raw: unknown): PublicationRecord[] {
  if (!Array.isArray(raw)) return []
  const records: PublicationRecord[] = []
  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object') continue
    const { hash, at, roots, files, kind } = entry as Record<string, unknown>
    if (typeof hash !== 'string' || typeof at !== 'string' || typeof files !== 'number') continue
    if (typeof kind !== 'string' || !KINDS.has(kind)) continue
    if (!Array.isArray(roots) || !roots.every((it) => typeof it === 'string')) continue
    records.push({ hash, at, roots: [...roots], files, kind: kind as PublicationKind })
  }
  return records
}

// Newest first; whatever falls off the end is simply forgotten — the objects stay on the server, only the
// bookmark to them goes.
export function appendHistory(records: PublicationRecord[], entry: PublicationRecord, limit: number): PublicationRecord[] {
  return [entry, ...records].slice(0, historyLimit(limit))
}

// Anything that is not a positive whole number is the default: a limit of 0 or NaN would silently turn the
// history off, which no one asked for by mistyping.
export function historyLimit(value: number | undefined): number {
  if (value == null || !Number.isFinite(value) || value < 1) return DEFAULT_HISTORY_LIMIT
  return Math.floor(value)
}
