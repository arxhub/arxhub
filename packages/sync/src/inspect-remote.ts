import { illegalState } from '@arxhub/errors'
import { EMPTY_SNAPSHOT_HASH } from './empty-snapshot-hash'
import type { SyncRemote } from './remote/sync-remote'
import { snapshotHash } from './snapshot-hash'
import type { Snapshot } from './types'

// What a remote holds, as far as a screen asking "is this where my vault is?" needs to know.
export type RemoteSummary = { empty: true } | { empty: false; documents: number; bytes: number }

const VAULT_PREFIX = 'vault/'
const decoder = new TextDecoder()

// One head read and, when there is a head, one snapshot fetch — nothing is written anywhere. The
// counts are the vault's own files: plugin storage travels in the same manifest, but "N documents" is
// what the person keeps, not what the plugins keep for them. A file whose size predates sized
// manifests counts as zero bytes; the total is a hint, not an accounting.
export async function inspectRemote(remote: SyncRemote): Promise<RemoteSummary> {
  const head = await remote.getHead()
  if (head == null || head === EMPTY_SNAPSHOT_HASH) return { empty: true }

  const bytes = (await remote.getObjects([head])).get(head)
  if (bytes == null) throw illegalState(`The remote names head ${head} but does not hold it`)
  const snapshot: Snapshot = JSON.parse(decoder.decode(bytes))
  // Same zero-trust rule as the engine: a snapshot is only what it hashes to.
  if (snapshot.hash !== head || snapshotHash(snapshot.parent, snapshot.files) !== head) {
    throw illegalState(`Snapshot integrity check failed: requested ${head}, got ${snapshot.hash}`)
  }

  let documents = 0
  let total = 0
  for (const [pathname, file] of Object.entries(snapshot.files)) {
    if (!pathname.startsWith(VAULT_PREFIX)) continue
    documents += 1
    total += file.size ?? 0
  }
  if (documents === 0) return { empty: true }
  return { empty: false, documents, bytes: total }
}
