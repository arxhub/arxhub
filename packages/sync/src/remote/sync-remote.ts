// The port a SyncEngine pushes to / pulls from. Deliberately NOT a VirtualFileSystem: driving a
// remote through generic per-file VFS calls made the wire protocol emergent — one HTTP round trip
// per exists/read/write, O(history × chunks) requests per sync. This interface is batch-first so a
// transport can move many objects per request and the server can offer head compare-and-swap.
//
// An "object" is an opaque blob addressed by the sha256 hex of its PLAINTEXT content — both content
// chunks and snapshot JSONs live in the same namespace (hashes are collision-free across kinds).
// A remote never verifies content (it may only ever see ciphertext, see EncryptedSyncRemote); the
// engine proves every object against its address after download.
export interface SyncRemote {
  // The hash of the remote head snapshot, or null when the remote has never been pushed to.
  getHead(): Promise<string | null>

  // Compare-and-swap the head: move it to `next` only if it still equals `expected` (null = unset).
  // Returns false when another device moved the head first — the caller must re-sync, not overwrite.
  setHead(expected: string | null, next: string): Promise<boolean>

  // Which of `hashes` the remote already stores. One round trip for the whole batch.
  hasObjects(hashes: string[]): Promise<Set<string>>

  // Fetch a batch of objects. Missing hashes are simply absent from the result map — the caller
  // decides whether absence is a broken chain (stop walking) or an error (fail the sync).
  getObjects(hashes: string[]): Promise<Map<string, Uint8Array>>

  // Store a batch of objects. Insertion order is preserved end-to-end, so callers can order
  // parents before children to keep a partially-applied batch consistent.
  putObjects(objects: Map<string, Uint8Array>): Promise<void>
}
