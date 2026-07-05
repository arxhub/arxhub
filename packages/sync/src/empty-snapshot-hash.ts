import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { stableStringify } from '@arxhub/stdlib/record/stable-stringify'

// The root of every snapshot chain: the snapshot of an empty file set. Repo.prepare() writes it
// into every local store, so this hash is shared knowledge across devices — a remote whose head is
// null is equivalent to a remote standing at this snapshot.
export const EMPTY_SNAPSHOT_HASH = sha256(stableStringify({}))
