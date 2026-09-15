import { hasErrorCode, illegalState } from '@arxhub/errors'
import { join } from '@arxhub/path'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { splitPathname } from '@arxhub/stdlib/fs/split-pathname'
import { compareAndSwap, type VirtualFile, type VirtualFileSystem, type VirtualWalker } from '@arxhub/vfs'
import AsyncLock from 'async-lock'
import dayjs from 'dayjs'
import { Checkout } from './checkout'
import { Chunker } from './chunker'
import { EMPTY_SNAPSHOT_HASH } from './empty-snapshot-hash'
import { repoHeadMoved } from './errors'
import { snapshotHash } from './snapshot-hash'
import type { FileStatus, MergeResult, Snapshot, SnapshotFile, SnapshotFileChunk } from './types'

// A lost head compare-and-swap is self-healing — the writer re-reads head, rebuilds on it and tries
// again, and every loss means another writer got a snapshot of its own in. The bound exists for a bug
// that always loses, or a store that always answers no, so neither spins forever. It is deliberately
// higher than the engine's MAX_HEAD_MOVED_RETRIES: a retry here costs a head read and a snapshot
// rebuild, not a whole sync round, and the writers that share one store are a few tabs or a handful of
// e2e workers, each of which wins at most once per attempt of ours before it has nothing left to write.
export const MAX_HEAD_RETRIES = 16

const encodeHash = (hash: string) => new TextEncoder().encode(hash)

// What a checkpoint changed about a file is its content and its document identity — never the
// sizes or the file id, which a manifest written before they existed simply lacks. Comparing the
// entries as JSON made the first manifest with sizes report every file changed against its parent,
// and rebase then replayed the whole tree over the remote head, including files edited there.
function sameEntry(a: SnapshotFile | undefined, b: SnapshotFile | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  return a.hash === b.hash && a.identity === b.identity
}

// Whether THIS device holds a file's content, given its manifest entry. The default holds everything —
// the offline-first promise as it stands; a device that declines a file keeps the path in its manifest
// as 'pending' and fetches the content when the file is opened.
export type MaterializePolicy = (file: SnapshotFile) => boolean

// A format-aware merge, tried before merge() falls back to writing a whole-file conflict copy. `base`
// is null when this device no longer holds the base version's chunks (or there was no base at all) —
// the merger sees that as "no common ancestor" rather than this code guessing at one. Returning null
// means "not my format, do what you did before" (F-05, `14-sync`): the caller (Repo.merge) never
// interprets the bytes itself, so a format it does not recognise degrades to the pre-existing behaviour
// instead of silently mangling content it can't parse.
export type ContentMerger = (
  pathname: string,
  base: Uint8Array | null,
  local: Uint8Array,
  remote: Uint8Array,
) => Promise<{ merged: Uint8Array; conflicts: number } | null>

export class Repo {
  // The working tree being versioned (user content). Read for status/snapshot, written on merge.
  private readonly tree: VirtualFileSystem
  // The repo store (`/repo/...`: changes journal, snapshots, chunks). Kept separate so it can live
  // outside the synced tree (locally, in state/) and never chunk itself. Defaults to `tree`.
  private readonly store: VirtualFileSystem
  private readonly lock: AsyncLock
  private readonly changes: VirtualFile
  private readonly chunker: Chunker
  // This device's view of the tree — see Checkout. Flushed at the end of every operation that touched it.
  private readonly checkout: Checkout
  private materializePolicy: MaterializePolicy = () => true
  private contentMerger: ContentMerger | null = null

  constructor(tree: VirtualFileSystem, store: VirtualFileSystem = tree) {
    this.tree = tree
    this.store = store
    this.lock = new AsyncLock()
    this.changes = this.getChangesFile()
    this.chunker = new Chunker()
    this.checkout = new Checkout(tree, this.getIndexFile())
  }

  exclusive<T>(work: () => Promise<T>): Promise<T> {
    return this.lock.acquire('operation', work)
  }

  setMaterializePolicy(policy: MaterializePolicy): void {
    this.materializePolicy = policy
  }

  // Registered by whichever plugin owns a format's structure (ArxEditorPlugin, for `.arx`) — Repo
  // itself knows nothing about any file format. `null` (the default) means every "both modified"
  // conflict falls straight to a whole-file copy, exactly as before this existed.
  setContentMerger(merger: ContentMerger | null): void {
    this.contentMerger = merger
  }

  // Does a fetch owe this file its chunks: yes when the policy wants it, and yes when it is already on
  // disk — a file this device holds is kept current whatever the policy says about its size.
  async wantsContent(file: SnapshotFile): Promise<boolean> {
    return this.materializePolicy(file) || this.checkout.knows(file.pathname)
  }

  isPending(pathname: string): Promise<boolean> {
    return this.checkout.isPending(pathname)
  }

  pendingPaths(): Promise<string[]> {
    return this.checkout.pendingPaths()
  }

  // Put a pending file's content on disk. The chunks have to be in the local store already — the engine
  // fetches them first (SyncEngine.materialize); this is the half that does not need the network.
  materialize(pathname: string): Promise<void> {
    return this.exclusive(async () => {
      if (!(await this.checkout.isPending(pathname))) return
      const head = await this.getHeadSnapshot()
      const file = head.files[pathname]
      if (file == null) {
        await this.checkout.clearPending(pathname)
        return
      }
      if (!(await this.hasChunks(file))) throw illegalState(`The content of ${pathname} has not been fetched`)
      await this.writeFile(file)
      await this.checkout.flush()
    })
  }

  // The journal is a SET of paths to look at, not a log of what happened: a note saved forty times
  // between two rounds is one entry, and status() would only have skipped the duplicates anyway.
  add(path: string): Promise<void> {
    return this.lock.acquire('changes', async () => {
      const paths = await this.changes.readJSON<string[]>([])
      if (paths.includes(path)) return
      paths.push(path)
      await this.changes.writeJSON(paths)
    })
  }

  // TODO: Maybe convert to async iterator
  async status(snapshot: Snapshot): Promise<FileStatus[]> {
    const result: FileStatus[] = []
    const processed = new Set<string>()

    for (const pathname in snapshot.files) {
      const status = await this.fileStatus(pathname, snapshot)
      if (status != null) {
        result.push(status)
      }
      processed.add(pathname)
    }

    const paths = await this.changes.readJSON([])

    for (const path of paths) {
      if (processed.has(path)) continue

      for await (const file of this.tree.walk(path)) {
        if (processed.has(file.pathname)) continue
        const status = await this.fileStatus(file.pathname, snapshot)
        if (status != null) {
          result.push(status)
        }
        processed.add(file.pathname)
      }
    }

    await this.checkout.flush()
    return result
  }

  private async fileStatus(pathname: string, snapshot: Snapshot): Promise<FileStatus | null> {
    const hash = await this.checkout.hashOf(pathname)
    const local = snapshot.files[pathname]

    if (hash == null) {
      if (local == null) {
        await this.checkout.clearPending(pathname)
        return null
      }
      // Not on disk by this device's choice, not by the user's: the manifest keeps the file, and
      // reading its absence as a deletion would push that deletion to every other device.
      if (await this.checkout.isPending(pathname)) return null
      await this.checkout.forget(pathname)
      return { pathname, type: 'deleted' }
    }
    // Something put a file at a pending path — it is a file now, and judged as one.
    await this.checkout.clearPending(pathname)
    if (local == null) return { pathname, type: 'created' }
    return hash !== local.hash ? { pathname, type: 'modified' } : null
  }

  snapshot(): Promise<Snapshot> {
    return this.lock.acquire('changes', () => this.snapshotChanges())
  }

  private async snapshotChanges(): Promise<Snapshot> {
    for (let attempt = 1; ; attempt++) {
      const head = await this.getHeadSnapshot()
      const changes = await this.status(head)
      if (changes.length === 0) {
        return head
      }
      const snapshot = await this.buildSnapshot(head, changes)
      await this.getSnapshotFile(snapshot.hash).writeJSON(snapshot)
      if (await this.advanceHead(head.hash, snapshot.hash)) {
        await this.changes.writeJSON([])
        return snapshot
      }
      // Another writer's snapshot landed on the head this one was built against. The retry starts from
      // status() again rather than re-parenting `files` onto the new head: that writer shares this tree
      // (a second tab, a second worker), so its head carries entries this pass never saw, and a snapshot
      // re-parented blind would read as their deletion. The chunks are already in the store, so the
      // second pass writes none of them again; the object this pass wrote stays behind, content-addressed
      // and unlinked, which costs disk and nothing else.
      if (attempt >= MAX_HEAD_RETRIES) throw repoHeadMoved()
    }
  }

  private async buildSnapshot(head: Snapshot, changes: FileStatus[]): Promise<Snapshot> {
    const files: Record<string, SnapshotFile> = { ...head.files }
    const deleted = new Set(changes.filter((change) => change.type === 'deleted').map((change) => change.pathname))

    for (const change of changes) {
      const { pathname, type } = change

      if (type === 'deleted') {
        delete files[pathname]
        continue
      }

      // else created || modified

      const file = this.tree.file(pathname)
      const chunks: SnapshotFileChunk[] = []
      let size = 0

      for await (const chunk of this.chunker.split(file)) {
        const hash = sha256(chunk)
        const chunkFile = this.getChunkFile(hash)

        if (!(await chunkFile.exists())) {
          await chunkFile.write(chunk)
        }

        chunks.push({ hash, size: chunk.byteLength })
        size += chunk.byteLength
      }

      // status() just established this hash, so the checkout answers from its index without a read.
      const fileHash = (await this.checkout.hashOf(pathname)) ?? ''

      // The same path is the same file. A NEW path holding content whose old path is gone in this very
      // round is that file renamed, and keeps its ids. A new path holding content that still exists
      // elsewhere is a COPY, and a copy is a new file: giving it the original's ids would make two
      // files one — which is what this used to do, by matching on hash alone.
      const previous = head.files[pathname] ?? Object.values(head.files).find((entry) => entry.hash === fileHash && deleted.has(entry.pathname))
      files[pathname] = {
        fileId: previous?.fileId ?? crypto.randomUUID(),
        ...(previous?.identity ? { identity: previous.identity } : {}),
        hash: fileHash,
        size,
        pathname: pathname,
        chunks,
      }
    }

    await this.completeLegacyEntries(files)
    await this.checkout.flush()

    return {
      // The address commits to files AND parent (see snapshotHash) — matches prepare()'s
      // EMPTY_SNAPSHOT_HASH, which is snapshotHash(null, {}).
      hash: snapshotHash(head.hash, files),
      parent: head.hash,
      timestamp: dayjs().unix(),
      files,
    }
  }

  // Entries carried over from a manifest written before sizes and file ids existed are completed here,
  // while a new manifest is being written anyway: a size from the local chunk store when the chunk is
  // there (it may not be — history content is not mirrored), a fresh file id always. Two devices may
  // complete the same entry with different ids in the same round; the merge keeps whichever entry the
  // remote head has (entries are compared by content, never by id), so they converge on one — and
  // nothing refers to a file id until they have.
  private async completeLegacyEntries(files: Record<string, SnapshotFile>): Promise<void> {
    for (const [pathname, entry] of Object.entries(files)) {
      const chunks = entry.chunks.some((chunk) => chunk.size === undefined) ? await this.sizedChunks(entry.chunks) : entry.chunks
      const sized = chunks.every((chunk) => chunk.size !== undefined)
      if (entry.fileId !== undefined && chunks === entry.chunks && (entry.size !== undefined || !sized)) continue
      files[pathname] = {
        ...entry,
        fileId: entry.fileId ?? crypto.randomUUID(),
        chunks,
        ...(sized ? { size: chunks.reduce((total, chunk) => total + (chunk.size ?? 0), 0) } : {}),
      }
    }
  }

  private async sizedChunks(chunks: SnapshotFileChunk[]): Promise<SnapshotFileChunk[]> {
    const out: SnapshotFileChunk[] = []
    for (const chunk of chunks) {
      if (chunk.size !== undefined) {
        out.push(chunk)
        continue
      }
      const file = this.getChunkFile(chunk.hash)
      out.push((await file.exists()) ? { ...chunk, size: (await file.vfs.head(file.pathname)).size } : chunk)
    }
    return out
  }

  async rebase(local: Snapshot, remote: Snapshot, base: Snapshot | null): Promise<void> {
    if (base?.hash === remote.hash) return
    let from = local
    for (let attempt = 1; ; attempt++) {
      const top = await this.replay(from, remote, base)
      if (await this.advanceHead(from.hash, top.hash)) return
      // The local chain moved while this replayed it. If it merely GREW — a checkpoint landed on top of
      // `from`, an editor save in another tab — that checkpoint belongs on the remote as much as the rest,
      // so the replay starts over from the new head and carries it along; leaving it behind is exactly the
      // orphan this exists to prevent. If it was REWRITTEN — no longer descends from `from`, which is what
      // another device's own rebase leaves — this replay was computed against history that is gone, and
      // the engine re-runs the whole round against what is there now.
      const current = await this.getHeadSnapshot()
      if (current.hash === top.hash) return
      if (!(await this.isAncestor(from.hash, current.hash)) || attempt >= MAX_HEAD_RETRIES) throw repoHeadMoved()
      from = current
    }
  }

  // Writes every local snapshot since `base` again on top of `remote`, oldest first, each re-addressed to
  // its new parent, and returns the new top. Objects only — moving the head is the caller's, so that a
  // snapshot's address commits to a parent that is already there when head names it.
  private async replay(local: Snapshot, remote: Snapshot, base: Snapshot | null): Promise<Snapshot> {
    const pending: Snapshot[] = []
    for await (const snapshot of this.ancestry(local.hash)) {
      if (snapshot.hash === base?.hash || snapshot.parent === null) break
      pending.push(snapshot)
    }
    let head = remote
    for (const snapshot of pending.reverse()) {
      const parent = await this.getSnapshotFile(snapshot.parent!).readJSON<Snapshot>()
      const files = { ...head.files }
      for (const path of new Set([...Object.keys(parent.files), ...Object.keys(snapshot.files)])) {
        if (sameEntry(parent.files[path], snapshot.files[path])) continue
        if (snapshot.files[path]) files[path] = snapshot.files[path]
        else delete files[path]
      }
      const replayed: Snapshot = { ...snapshot, parent: head.hash, files, hash: snapshotHash(head.hash, files) }
      await this.getSnapshotFile(replayed.hash).writeJSON(replayed)
      head = replayed
    }
    return head
  }

  // Walks a snapshot's parent chain, yielding each successfully-read snapshot oldest-link-last.
  // A genuinely absent snapshot (pruned chain / partial upload) ends the walk cleanly via break;
  // any OTHER error (transport/IO) propagates so the caller fails loudly instead of treating a
  // flaky read as "chain ended" — that would let findBaseSnapshot return a wrong/empty base and
  // resurrect deleted files during merge. Cycles are bounded by the visited set.
  private async *ancestry(head: string): AsyncGenerator<Snapshot> {
    const visited = new Set<string>()
    let current: string | null = head
    while (current != null && !visited.has(current)) {
      visited.add(current)
      let snapshot: Snapshot
      try {
        snapshot = await this.getSnapshotFile(current).readJSON()
      } catch (error) {
        if (hasErrorCode(error, 'FileNotFound')) break
        throw error
      }
      yield snapshot
      current = snapshot.parent
    }
  }

  // True when `ancestor` is `head` itself or on head's parent chain. Walks the LOCAL snapshot store
  // only — the engine calls this after fetch(), which has already replicated the remote chain down to
  // the first locally-known snapshot, so a hole here means the chain genuinely doesn't connect.
  async isAncestor(ancestor: string, head: string): Promise<boolean> {
    if (ancestor === head) return true
    for await (const snapshot of this.ancestry(head)) {
      if (snapshot.hash === ancestor || snapshot.parent === ancestor) return true
    }
    return false
  }

  async findBaseSnapshot(localHead: string, remoteHead: string): Promise<Snapshot | null> {
    // Confirmed local ancestors: keyed by hash, value is the already-parsed snapshot. Only hashes
    // whose snapshot file was actually read land here, so the lowest common ancestor returned below
    // is guaranteed to exist (a hash with a missing file must never be handed back as a base).
    const localAncestors = new Map<string, Snapshot>()
    for await (const snapshot of this.ancestry(localHead)) {
      localAncestors.set(snapshot.hash, snapshot)
    }

    // Walk the remote ancestry until it meets a confirmed local ancestor (the LCA); return the
    // local copy we already parsed rather than re-reading it.
    for await (const snapshot of this.ancestry(remoteHead)) {
      const base = localAncestors.get(snapshot.hash)
      if (base != null) return base
    }

    return null
  }

  // Reports every conflict copy this merge wrote, as the vault path it landed at — what a caller
  // surfaces to the user (a toast, a marker in the file tree), never the original path, since that one
  // never moved.
  async merge(
    baseFiles: Record<string, SnapshotFile>,
    localFiles: Record<string, SnapshotFile>,
    remoteFiles: Record<string, SnapshotFile>,
  ): Promise<MergeResult> {
    const conflicts: string[] = []
    const unresolved: { pathname: string; count: number }[] = []
    const decisions: { pathname: string; kind: 'edit-over-delete' }[] = []
    const pathnames = new Set([...Object.keys(baseFiles), ...Object.keys(localFiles), ...Object.keys(remoteFiles)])
    for (const pathname of pathnames) {
      const baseFile = baseFiles[pathname]
      const localFile = localFiles[pathname]
      const remoteFile = remoteFiles[pathname]

      const base = baseFile != null
      const local = localFile != null
      const remote = remoteFile != null

      // Only local exists
      if (local && !remote) {
        if (!base) {
          await this.take(localFile)
        } else if (localFile.hash === baseFile.hash) {
          // Remote no longer lists this path and local hasn't touched it since — safe to drop. Forced:
          // this path may already be gone from the tree (e.g. the local side deleted it independently
          // of what this stale snapshot entry still claims), and that must converge, not crash the sync.
          await this.tree.delete(pathname, { force: true })
          await this.checkout.forget(pathname)
          await this.checkout.clearPending(pathname)
        } else {
          // local modified, remote deleted -> silently keep local (no conflict; the tree already holds
          // the modified content, so there is nothing to write) — but it IS a decision made for the
          // user, not merely a no-op, so it is reported. Never offered to a content merger: the deleting
          // side has no document at all to hold a conflict marker in.
          decisions.push({ pathname, kind: 'edit-over-delete' })
        }
        continue
      }

      // Only remote exists
      if (!local && remote) {
        if (!base) {
          await this.take(remoteFile)
        } else if (remoteFile.hash === baseFile.hash) {
          await this.tree.delete(pathname, { force: true })
          await this.checkout.forget(pathname)
          await this.checkout.clearPending(pathname)
        } else {
          // Remote modified, local deleted (or renamed away) it — the edit wins, exactly like the
          // symmetric branch above, so it has to be materialized here: unlike "local modified, remote
          // deleted", the tree does NOT already hold this content (the local side has nothing at this
          // path right now). Skipping this write used to silently drop the remote edit entirely —
          // FR-152 requires it survive, and a rename-vs-edit race is the sharpest case: the edit
          // resurfaces under its old name instead of landing inside the rename, which is a duplicate
          // for the user to reconcile rather than the data loss it was.
          await this.take(remoteFile)
          decisions.push({ pathname, kind: 'edit-over-delete' })
        }
        continue
      }

      // Prevent conflict
      if (base && local && remote && baseFile.hash === localFile.hash) {
        await this.take(remoteFile)
        continue
      }

      // Both exist
      if (localFile.hash !== remoteFile.hash) {
        const merged = await this.tryContentMerge(pathname, baseFile ?? null, localFile, remoteFile)
        if (merged) {
          if (merged.conflicts > 0) unresolved.push({ pathname, count: merged.conflicts })
        } else {
          conflicts.push(await this.writeConflictFile(remoteFile))
        }
      }

      // else: same content -> no-op
    }
    await this.checkout.flush()
    return { conflicts, unresolved, decisions }
  }

  // Tried before a "both modified" conflict falls back to a whole-file copy. Returns null exactly when
  // there is nothing this merger can do about it — no merger registered, or the remote side's chunks
  // are not actually here yet (should not happen: a file this device keeps on disk is always fetched in
  // full — see SyncEngine.fetch/wantsContent — but a truncated write is worse than a conflict copy, so
  // this is checked rather than assumed).
  private async tryContentMerge(
    pathname: string,
    baseFile: SnapshotFile | null,
    localFile: SnapshotFile,
    remoteFile: SnapshotFile,
  ): Promise<{ conflicts: number } | null> {
    if (!this.contentMerger) return null
    if (!(await this.hasChunks(remoteFile))) return null
    // The base version's chunks are not mirrored past the head (see fetch() in SyncEngine) — absent
    // here reads as "no common ancestor" to the merger, same as a genuinely empty base.
    const base = baseFile && (await this.hasChunks(baseFile)) ? await this.readChunks(baseFile.chunks) : null
    const local = await this.tree.file(pathname).read()
    const remote = await this.readChunks(remoteFile.chunks)
    const result = await this.contentMerger(pathname, base, local, remote)
    if (!result) return null
    await this.writeMergedContent(pathname, result.merged)
    return { conflicts: result.conflicts }
  }

  private async readChunks(chunks: SnapshotFileChunk[]): Promise<Uint8Array> {
    const parts: Uint8Array[] = []
    let total = 0
    for (const chunk of chunks) {
      const bytes = await this.getChunkFile(chunk.hash).read()
      parts.push(bytes)
      total += bytes.byteLength
    }
    const result = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
      result.set(part, offset)
      offset += part.byteLength
    }
    return result
  }

  // What a content merger's result is written through — not from stored chunks, so the chunker plays
  // no part, but otherwise the same bookkeeping as writeFile: the checkout trusts the fresh stat
  // without a re-read, and the journal picks the path up for this device's next snapshot.
  private async writeMergedContent(pathname: string, content: Uint8Array): Promise<void> {
    await this.tree.file(pathname).write(content)
    await this.checkout.record(pathname, sha256(content))
    await this.checkout.clearPending(pathname)
    await this.add(pathname)
  }

  // Put the remote's version of a file on this device — as content when the chunks are here, as a
  // pending mark when they are not. Deciding by the chunks actually present rather than by the policy
  // keeps a policy change, a stale index or an interrupted fetch from ending in a truncated write: a
  // file the policy wanted has its chunks by the time merge runs (fetch fails loudly otherwise), and a
  // file it did not is exactly what pending is for.
  private async take(file: SnapshotFile): Promise<void> {
    if (await this.hasChunks(file)) await this.writeFile(file)
    else await this.checkout.markPending(file.pathname, file.hash)
  }

  private async hasChunks(file: SnapshotFile): Promise<boolean> {
    for (const chunk of file.chunks) {
      if (!(await this.getChunkFile(chunk.hash).exists())) return false
    }
    return true
  }

  private async writeFile(file: SnapshotFile): Promise<void> {
    const stream = this.chunker.merge(file.chunks.map((it) => this.getChunkFile(it.hash)))
    const writable = await this.tree.file(file.pathname).writable()
    await stream.pipeTo(writable)
    await this.checkout.record(file.pathname, file.hash)
    await this.checkout.clearPending(file.pathname)
    await this.add(file.pathname)
  }

  // Names the copy after the remote content's own hash, so two DIFFERENT conflicting versions never
  // collide — but the SAME hash recurring (a revert on one side lands back on a version that already
  // has a conflict copy) would, and the file sitting there by then may be the user's own edits made
  // to what was originally just a copy. Never overwrite blind: an existing file with the same hash is
  // this same conflict already materialized (nothing to do); anything else earns a versioned suffix
  // instead of losing whatever is actually there. Returns the path it actually wrote to.
  private async writeConflictFile(remote: SnapshotFile): Promise<string> {
    const { path, name, ext } = splitPathname(remote.pathname)
    const stem = `conflict-${remote.hash.slice(0, 8)}-${name}`
    const nameAt = (suffix: string) => (ext ? `${stem}${suffix}.${ext}` : `${stem}${suffix}`)

    let pathname = join(path, nameAt(''))
    for (let n = 2; ; n++) {
      const existingHash = await this.checkout.hashOf(pathname)
      if (existingHash == null) break
      if (existingHash === remote.hash) return pathname
      pathname = join(path, nameAt(`-${n}`))
    }

    const file = this.tree.file(pathname)
    const writable = await file.writable()
    const readable = this.chunker.merge(remote.chunks.map((it) => this.getChunkFile(it.hash)))
    await readable.pipeTo(writable)
    await this.checkout.record(file.pathname, remote.hash)
    await this.add(file.pathname)
    return file.pathname
  }

  async prepare(): Promise<void> {
    const hash = EMPTY_SNAPSHOT_HASH
    const snapshot = this.getSnapshotFile(hash)
    if (!(await snapshot.exists())) {
      await snapshot.writeJSON({
        hash: hash,
        parent: null,
        timestamp: 0,
        files: {},
      } satisfies Snapshot)
    }
    // Losing the seed means another writer seeded first, which is the same outcome.
    if (!(await this.getHeadFile().exists())) await this.advanceHead(null, hash)
  }

  // The ONE way the head moves: `next` lands only while head still reads `expected` (null: no head yet),
  // and a `false` means someone else moved it first — re-read, rebuild, try again. Every caller has
  // already written `next`'s snapshot object, so head is always the LAST thing written and a reader that
  // follows it finds what it names. Public because FileHistory writes checkpoints through it; there is
  // deliberately no other write path to the head file.
  async advanceHead(expected: string | null, next: string): Promise<boolean> {
    return compareAndSwap(this.store, this.getHeadFile().pathname, expected === null ? null : encodeHash(expected), encodeHash(next))
  }

  async getHeadSnapshot(): Promise<Snapshot> {
    const head = this.getHeadFile()
    const hash = await head.readText()
    return this.getSnapshotFile(hash).readJSON()
  }

  listSnapshots(): VirtualWalker {
    return this.store.walk('/repo/snapshots')
  }

  getChangesFile(): VirtualFile {
    return this.store.file(`/repo/changes`)
  }

  // The checkout index — device-local, like everything else under /repo that is not an object.
  getIndexFile(): VirtualFile {
    return this.store.file(`/repo/index`)
  }

  getHeadFile(): VirtualFile {
    return this.store.file(`/repo/head`)
  }

  // The remote head hash of the last SUCCESSFUL sync — the engine's rollback-detection anchor. Local
  // state (never synced); deleting it re-enters trust-on-first-sync against the current remote.
  getLastSyncedFile(): VirtualFile {
    return this.store.file(`/repo/last-synced`)
  }

  getSnapshotFile(hash: string): VirtualFile {
    return this.store.file(`/repo/snapshots/${hash}`)
  }

  getChunkFile(hash: string): VirtualFile {
    return this.store.file(`/repo/chunks/${hash.substring(0, 2)}/${hash.substring(2, 4)}/${hash}`)
  }

  getManifestFile(hash: string): VirtualFile {
    return this.store.file(`/repo/manifests/${hash}`)
  }
}
