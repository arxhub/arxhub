import { snapshotHash } from './snapshot-hash'

// The root of every snapshot chain: the snapshot of an empty file set with no parent. Repo.prepare()
// writes it into every local store, so this hash is shared knowledge across devices — a remote whose
// head is null is equivalent to a remote standing at this snapshot.
export const EMPTY_SNAPSHOT_HASH = snapshotHash(null, {})
