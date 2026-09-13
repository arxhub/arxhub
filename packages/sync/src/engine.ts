import { hasErrorCode, illegalState } from '@arxhub/errors'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import AsyncLock from 'async-lock'
import { EMPTY_SNAPSHOT_HASH } from './empty-snapshot-hash'
import { syncHeadMoved } from './errors'
import type { SyncRemote } from './remote/sync-remote'
import type { Repo } from './repo'
import { snapshotHash } from './snapshot-hash'
import type { MergeResult, Snapshot } from './types'

export type SyncEngineOptions = {
  local: Repo
  remote: SyncRemote
}

// Batch bounds: cap per-request memory on both ends while keeping round trips low. A Rabin chunk is
// at most 8 MiB, so a GET batch tops out around 256 MiB only in the worst case — real note-sized
// chunks make these effectively "a handful of requests per sync".
const GET_BATCH = 32
const STAT_BATCH = 512
const PUT_BATCH_BYTES = 16 * 1024 * 1024

// A lost head CAS is self-healing (see push()) — retrying the whole round picks up whatever the
// winner just committed. Bounded so genuine, sustained contention (or a bug that always loses the
// race) surfaces as an error instead of spinning forever.
const MAX_HEAD_MOVED_RETRIES = 3

const decoder = new TextDecoder()

// Orchestrates one sync round between the local Repo and a SyncRemote:
//
//   1. fetch  — pull the remote head's snapshot ancestry only until a snapshot we already have
//               (the delta, not the full history), then the head's missing chunks, verifying every
//               object against its address (zero-trust remote).
//   2. merge  — three-way merge of local vs remote over their common base, exactly as before.
//   3. rebase — snapshot the merged tree on top of the remote head so history stays linear.
//   4. push   — upload only the new snapshots + the chunks the remote lacks (batched stat/put),
//               then commit by compare-and-swapping the remote head.
//
// Steady state with no changes is 1 request (getHead). The previous design walked and re-transferred
// the ENTIRE snapshot history through per-file VFS calls on every sync — O(history × chunks) round
// trips, growing with every sync ever made.
export class SyncEngine {
  private readonly lock: AsyncLock
  private readonly local: Repo
  private readonly remote: SyncRemote

  constructor(opts: SyncEngineOptions) {
    this.lock = new AsyncLock()
    this.local = opts.local
    this.remote = opts.remote
  }

  async add(path: string): Promise<void> {
    await this.local.add(path)
  }

  // Returns whatever conflicts THIS round's merge produced (empty when there were none) — a caller
  // (SyncExtension) surfaces it to the user instead of it being knowable only by browsing the vault
  // for a `conflict-*` file that quietly appeared.
  //
  // A SyncHeadMovedError from a losing round is retried here, whole, rather than left for the caller
  // to notice and re-invoke — the condition already says exactly what fixes it ("run sync again"), so
  // doing that automatically means a UI only ever sees a real failure, not a race it can't tell apart
  // from one.
  async sync(): Promise<MergeResult> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.lock.acquire('sync', () => this.syncOnce())
      } catch (error) {
        if (!hasErrorCode(error, 'SyncHeadMovedError') || attempt >= MAX_HEAD_MOVED_RETRIES) throw error
      }
    }
  }

  private async syncOnce(): Promise<MergeResult> {
    await this.local.prepare()

    // The head we sync AGAINST — also the CAS token: if another device moves the remote head
    // while we work, the final setHead fails and this sync throws instead of overwriting them.
    const syncedHead = await this.remote.getHead()

    // Rollback detection. The head is an unauthenticated pointer the server fully controls, so a
    // malicious/compromised remote could serve an OLD head and quietly unwind other devices'
    // pushes. Anchor: the head of the last successful sync must be the new head itself or one of
    // its ancestors (the server cannot forge snapshots — they're encrypted and hash-verified — so
    // descent is provable from real objects only). First sync has no anchor: trust-on-first-sync,
    // like the server's TOFU pairing. Deleting repo/last-synced re-enters that mode deliberately.
    const lastSyncedFile = this.local.getLastSyncedFile()
    const lastSynced = (await lastSyncedFile.exists()) ? (await lastSyncedFile.readText()).trim() || null : null
    if (lastSynced != null && syncedHead == null) {
      throw illegalState(
        'Remote head is gone but this device has synced before — the remote was wiped or rolled back. ' +
          'If intentional, delete repo/last-synced from local sync state and sync again.',
      )
    }

    if (syncedHead != null) await this.fetch(syncedHead)

    // Checked AFTER fetch: the remote chain is now replicated locally, so failing to reach the
    // anchor from the new head means the chain genuinely does not descend from it.
    if (lastSynced != null && syncedHead != null && !(await this.local.isAncestor(lastSynced, syncedHead))) {
      throw illegalState(
        `Remote head ${syncedHead} does not descend from the last synced head ${lastSynced} — possible rollback or fork by the remote. ` +
          'If the remote was reset intentionally, delete repo/last-synced from local sync state and sync again.',
      )
    }

    const { latest, result } = await this.local.exclusive(async () => {
      const localSnapshot = await this.local.snapshot()
      // A remote that has never been pushed to stands at the empty snapshot (prepare() guarantees
      // it exists locally), so merge/base-finding need no special null case.
      const remoteSnapshot = await this.local.getSnapshotFile(syncedHead ?? EMPTY_SNAPSHOT_HASH).readJSON<Snapshot>()
      const baseSnapshot = await this.local.findBaseSnapshot(localSnapshot.hash, remoteSnapshot.hash)

      const result = await this.local.merge(baseSnapshot?.files ?? {}, localSnapshot.files, remoteSnapshot.files)

      // Replay every local checkpoint so publishing the merged tree does not orphan offline history.
      await this.local.rebase(localSnapshot, remoteSnapshot, baseSnapshot)
      return { latest: await this.local.snapshot(), result }
    })

    await this.push(syncedHead, latest)

    // Only after a fully-committed sync: `latest` is now the remote head (push CAS'd it, or it
    // already WAS the head in the no-op case), so it becomes the next rollback anchor.
    await lastSyncedFile.writeText(latest.hash)
    return result
  }

  // Pull the remote head's ancestry into the local store. Snapshot JSONs are fetched down to the
  // first snapshot we already have; content chunks are replicated for the HEAD snapshot only —
  // merge/conflict materialization reads nothing older, and old history stays available for
  // base-finding without paying to mirror every version's content.
  private async fetch(head: string): Promise<void> {
    const chain: { snapshot: Snapshot; bytes: Uint8Array }[] = []
    const visited = new Set<string>()
    let current: string | null = head
    while (current != null && !visited.has(current)) {
      visited.add(current)
      if (await this.local.getSnapshotFile(current).exists()) break
      const objects = await this.remote.getObjects([current])
      const bytes = objects.get(current)
      // A missing ancestor ends the walk like a pruned chain (same policy as Repo.ancestry):
      // base-finding degrades to the additive empty-base merge and still converges.
      if (bytes == null) break
      const snapshot = this.parseSnapshot(current, bytes)
      chain.push({ snapshot, bytes })
      current = snapshot.parent
    }

    // Store parents before children so an interrupted fetch never leaves a child snapshot pointing
    // at a hole in the local chain.
    for (const { snapshot, bytes } of chain.reverse()) {
      await this.local.getSnapshotFile(snapshot.hash).write(bytes)
    }

    // Unlike a missing ANCESTOR further back (handled above as a pruned chain), a missing HEAD is not
    // survivable: `getHead()` said this object exists, and if the loop above still couldn't produce it
    // locally, the remote is lying about or has lost the very thing it just pointed at. Reading it
    // unconditionally next would throw a raw FileNotFound with no context — this names what actually
    // went wrong.
    if (!(await this.local.getSnapshotFile(head).exists())) {
      throw illegalState(`Remote head ${head} could not be fetched — the remote reports it but does not serve it.`)
    }

    const headSnapshot = await this.local.getSnapshotFile(head).readJSON<Snapshot>()
    await this.fetchChunks(headSnapshot)
  }

  async fetchFile(snapshot: Snapshot, path: string): Promise<void> {
    const file = snapshot.files[path]
    if (!file) throw illegalState(`File ${path} is not present in this snapshot`)
    await this.fetchChunks({ ...snapshot, files: { [path]: file } })
  }

  private async fetchChunks(snapshot: Snapshot): Promise<void> {
    const missing: string[] = []
    const seen = new Set<string>()
    for (const pathname in snapshot.files) {
      for (const chunk of snapshot.files[pathname].chunks) {
        if (seen.has(chunk.hash)) continue
        seen.add(chunk.hash)
        if (!(await this.local.getChunkFile(chunk.hash).exists())) missing.push(chunk.hash)
      }
    }

    for (let i = 0; i < missing.length; i += GET_BATCH) {
      const batch = missing.slice(i, i + GET_BATCH)
      const objects = await this.remote.getObjects(batch)
      for (const hash of batch) {
        const content = objects.get(hash)
        // Unlike a broken snapshot chain, a chunk hole is not survivable — the merge would
        // materialize a truncated file — so fail the sync loudly.
        if (content == null) throw illegalState(`Chunk ${hash} is missing on the remote`)
        // Zero-trust: prove the (decrypted) bytes hash to the address they came from before they
        // land in the local store — a malicious server can swap blobs under hash-named keys.
        const actual = sha256(content)
        if (actual !== hash) throw illegalState(`Chunk integrity check failed: expected ${hash}, got ${actual}`)
        await this.local.getChunkFile(hash).write(content)
      }
    }
  }

  // Zero-trust: a snapshot must prove itself twice — the declared hash must match the address it
  // was fetched from, AND its files+parent must actually hash to it (snapshotHash is the canonical
  // form), so a forged snapshot — or a real one with a rewritten parent — can't ride in under a
  // familiar name.
  private parseSnapshot(hash: string, bytes: Uint8Array): Snapshot {
    const snapshot: Snapshot = JSON.parse(decoder.decode(bytes))
    if (snapshot.hash !== hash || snapshotHash(snapshot.parent, snapshot.files) !== hash) {
      throw illegalState(`Snapshot integrity check failed: requested ${hash}, got ${snapshot.hash}`)
    }
    return snapshot
  }

  private async push(syncedHead: string | null, latest: Snapshot): Promise<void> {
    // Nothing changed anywhere: the merged snapshot IS the head we synced against.
    if (latest.hash === syncedHead) return

    // New local snapshots: latest back to the head we synced against (exclusive). The rebase in
    // sync() guarantees syncedHead is on this chain; a null syncedHead walks to the chain root.
    const chain: { hash: string; bytes: Uint8Array; snapshot: Snapshot }[] = []
    const visited = new Set<string>()
    let current: string | null = latest.hash
    while (current != null && current !== syncedHead && !visited.has(current)) {
      visited.add(current)
      let bytes: Uint8Array
      try {
        bytes = await this.local.getSnapshotFile(current).read()
      } catch (error) {
        if (hasErrorCode(error, 'FileNotFound')) break
        throw error
      }
      const snapshot: Snapshot = JSON.parse(decoder.decode(bytes))
      chain.push({ hash: current, bytes, snapshot })
      current = snapshot.parent
    }

    // Skip snapshots the remote already has — converges cheaply after an interrupted push.
    const known = await this.remote.hasObjects(chain.map((it) => it.hash))
    const fresh = chain.filter((it) => !known.has(it.hash))

    // Chunks referenced by the new snapshots, minus what the remote already stores. Stat in bounded
    // batches: one round trip per STAT_BATCH hashes instead of one per chunk.
    const wanted = new Set<string>()
    for (const { snapshot } of fresh) {
      for (const pathname in snapshot.files) {
        for (const chunk of snapshot.files[pathname].chunks) wanted.add(chunk.hash)
      }
    }
    const hashes = [...wanted]
    const missing: string[] = []
    for (let i = 0; i < hashes.length; i += STAT_BATCH) {
      const batch = hashes.slice(i, i + STAT_BATCH)
      const has = await this.remote.hasObjects(batch)
      for (const hash of batch) {
        if (!has.has(hash)) missing.push(hash)
      }
    }

    // Upload chunks first, snapshots after (a snapshot is the commit marker for its chunks), the
    // head CAS very last (the commit marker for the whole sync).
    let payload = new Map<string, Uint8Array>()
    let payloadBytes = 0
    for (const hash of missing) {
      const content = await this.local.getChunkFile(hash).read()
      payload.set(hash, content)
      payloadBytes += content.length
      if (payloadBytes >= PUT_BATCH_BYTES) {
        await this.remote.putObjects(payload)
        payload = new Map()
        payloadBytes = 0
      }
    }
    if (payload.size > 0) await this.remote.putObjects(payload)

    if (fresh.length > 0) {
      // Parents before children within the batch (Map insertion order is preserved end-to-end).
      const snapshots = new Map<string, Uint8Array>()
      for (const { hash, bytes } of fresh.reverse()) snapshots.set(hash, bytes)
      await this.remote.putObjects(snapshots)
    }

    const committed = await this.remote.setHead(syncedHead, latest.hash)
    if (!committed) {
      throw syncHeadMoved()
    }
  }
}
