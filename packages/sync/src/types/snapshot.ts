export type SnapshotFileChunk = {
  // Hash of chunk data, ignoring all metadata: pathname, etc
  hash: string
}

export type SnapshotFile = {
  // Hash of whole file, ignoring all metadata: pathname, timestamp, etc
  hash: string
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
