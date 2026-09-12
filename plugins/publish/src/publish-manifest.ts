import type { SnapshotFile } from '@arxhub/sync'

// The root object of a published site: a flat map of published vault path → its content-addressed
// file record (whole-file hash + ordered chunk hashes). Same SnapshotFile shape sync uses, so the
// chunk objects are byte-identical in form — only here they are stored UNENCRYPTED in a public
// store, and the manifest itself is a public object the server reads to reassemble files on read.
//
// Deliberately NOT reusing sync's Snapshot: there is no parent chain (publish keeps only the latest
// manifest, not history) and no cross-device merge — publish is a one-way owner→server export.
export interface PublishManifest {
  // Bumped if the on-wire shape ever changes, so an old reader can refuse a newer manifest.
  version: 1
  // Published root paths the user explicitly chose (folders/files). `files` is these expanded to
  // every contained file; `roots` is kept so a reader can render a faithful top-level index.
  roots: string[]
  // vault pathname → file record. Pathnames are the vault-relative POSIX paths (what /p/<path> asks
  // for). A folder is represented only by its contained files, never an entry of its own.
  files: Record<string, SnapshotFile>
  rendered?: Record<string, SnapshotFile & { status?: number }>
}
