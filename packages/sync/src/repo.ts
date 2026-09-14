import { hasErrorCode } from '@arxhub/errors'
import { join } from '@arxhub/path'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { splitPathname } from '@arxhub/stdlib/fs/split-pathname'
import type { VirtualFile, VirtualFileSystem, VirtualWalker } from '@arxhub/vfs'
import AsyncLock from 'async-lock'
import dayjs from 'dayjs'
import { Checkout } from './checkout'
import { Chunker } from './chunker'
import { EMPTY_SNAPSHOT_HASH } from './empty-snapshot-hash'
import { snapshotHash } from './snapshot-hash'
import type { FileStatus, MergeResult, Snapshot, SnapshotFile, SnapshotFileChunk } from './types'

// What a checkpoint changed about a file is its content and its document identity — never the
// sizes or the file id, which a manifest written before they existed simply lacks. Comparing the
// entries as JSON made the first manifest with sizes report every file changed against its parent,
// and rebase then replayed the whole tree over the remote head, including files edited there.
function sameEntry(a: SnapshotFile | undefined, b: SnapshotFile | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  return a.hash === b.hash && a.identity === b.identity
}

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
      if (local != null) await this.checkout.forget(pathname)
      return local != null ? { pathname, type: 'deleted' } : null
    }
    if (local == null) return { pathname, type: 'created' }
    return hash !== local.hash ? { pathname, type: 'modified' } : null
  }

  snapshot(): Promise<Snapshot> {
    return this.lock.acquire('changes', () => this.snapshotChanges())
  }

  private async snapshotChanges(): Promise<Snapshot> {
    const head = await this.getHeadSnapshot()
    const changes = await this.status(head)
    if (changes.length === 0) {
      return head
    }

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

    const snapshot = {
      // The address commits to files AND parent (see snapshotHash) — matches prepare()'s
      // EMPTY_SNAPSHOT_HASH, which is snapshotHash(null, {}).
      hash: snapshotHash(head.hash, files),
      parent: head.hash,
      timestamp: dayjs().unix(),
      files,
    }

    await this.getSnapshotFile(snapshot.hash).writeJSON(snapshot)
    await this.getHeadFile().writeText(snapshot.hash)

    await this.changes.writeJSON([])
    return snapshot
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
    await this.getHeadFile().writeText(head.hash)
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
          await this.writeFile(localFile)
        } else if (localFile.hash === baseFile.hash) {
          // Remote no longer lists this path and local hasn't touched it since — safe to drop. Forced:
          // this path may already be gone from the tree (e.g. the local side deleted it independently
          // of what this stale snapshot entry still claims), and that must converge, not crash the sync.
          await this.tree.delete(pathname, { force: true })
          await this.checkout.forget(pathname)
        }
        // else: local modified, remote deleted -> silently keep local (no conflict; the tree already
        // holds the modified content, so there is nothing to write).
        continue
      }

      // Only remote exists
      if (!local && remote) {
        if (!base) {
          await this.writeFile(remoteFile)
        } else if (remoteFile.hash === baseFile.hash) {
          await this.tree.delete(pathname, { force: true })
          await this.checkout.forget(pathname)
        } else {
          // Remote modified, local deleted (or renamed away) it — the edit wins, exactly like the
          // symmetric branch above, so it has to be materialized here: unlike "local modified, remote
          // deleted", the tree does NOT already hold this content (the local side has nothing at this
          // path right now). Skipping this write used to silently drop the remote edit entirely —
          // FR-152 requires it survive, and a rename-vs-edit race is the sharpest case: the edit
          // resurfaces under its old name instead of landing inside the rename, which is a duplicate
          // for the user to reconcile rather than the data loss it was.
          await this.writeFile(remoteFile)
        }
        continue
      }

      // Prevent conflict
      if (base && local && remote && baseFile.hash === localFile.hash) {
        await this.writeFile(remoteFile)
        continue
      }

      // Both exist
      if (localFile.hash !== remoteFile.hash) {
        conflicts.push(await this.writeConflictFile(remoteFile))
      }

      // else: same content -> no-op
    }
    await this.checkout.flush()
    return { conflicts }
  }

  private async writeFile(file: SnapshotFile): Promise<void> {
    const stream = this.chunker.merge(file.chunks.map((it) => this.getChunkFile(it.hash)))
    const writable = await this.tree.file(file.pathname).writable()
    await stream.pipeTo(writable)
    await this.checkout.record(file.pathname, file.hash)
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
    const isSnapshotExists = await snapshot.exists()
    if (!isSnapshotExists) {
      await snapshot.writeJSON({
        hash: hash,
        parent: null,
        timestamp: 0,
        files: {},
      } satisfies Snapshot)
    }

    const head = this.getHeadFile()
    const isHeadExists = await head.exists()
    if (!isHeadExists) {
      await head.writeText(hash)
    }
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
