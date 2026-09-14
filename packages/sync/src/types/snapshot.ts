export type SnapshotFileChunk = {
  // Hash of chunk data, ignoring all metadata: pathname, etc
  hash: string
  // Byte length of the chunk. Absent only on entries written before sizes were recorded; every new
  // entry carries it, and a legacy entry is filled from the local chunk store the next time the
  // manifest is written anyway — so no migration walks the chain. What it buys: an offset maps to a
  // chunk without fetching the chunks before it, and a download knows how much is left.
  size?: number
}

export type SnapshotFile = {
  // Storage identity — WHICH FILE this is, assigned at first appearance and carried across a rename
  // (the old path gone, the same content at a new one). Deliberately not `identity`: that one the
  // editor owns (a document's id from its envelope), and its history semantics — "same identity at
  // another path" means the document moved — must never fire on an id the editor did not give. An
  // image has no document; it still needs a name that survives being renamed.
  fileId?: string
  identity?: string
  historySource?: string
  // Hash of whole file, ignoring all metadata: pathname, timestamp, etc
  hash: string
  // Sum of the chunk sizes. Absent exactly when some chunk's size is.
  size?: number
  pathname: string
  chunks: SnapshotFileChunk[]
}

export type Snapshot = {
  hash: string
  parent: string | null

  // unix seconds
  timestamp: number

  // pathname -> file
  files: Record<string, SnapshotFile>
}
