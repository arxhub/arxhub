export type SnapshotFileChunk = {
  hash: string
  pathname: string
}

export type SnapshotFile = {
  hash: string
  pathname: string
  chunks: SnapshotFileChunk[]
}

export type Snapshot = {
  hash: string
  pathname: string
  timestamp: number

  // pathname -> file
  files: Record<string, SnapshotFile>
}
