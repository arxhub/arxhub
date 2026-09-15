import { illegalState, validation } from '@arxhub/errors'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { Chunker } from './chunker'
import type { Repo } from './repo'
import { snapshotHash } from './snapshot-hash'
import type { Snapshot, SnapshotFile, SnapshotFileChunk } from './types'

export type FileHistoryQuery = { identity: string } | { path: string }
export interface FileVersion {
  id: string
  savedAt: number
  hash: string
  path: string
}
export interface FileCheckpoint {
  path: string
  content: Uint8Array
  identity?: string
  savedAt?: number
  source?: string
}

const HASH = /^[0-9a-f]{64}$/
function checkPath(path: string) {
  if (!/^(vault|storage)\//.test(path) || path.includes('\\') || path.split('/').some((part) => !part || part === '.' || part === '..'))
    throw validation('Invalid history file path')
}

export class FileHistory {
  private readonly chunker = new Chunker()

  constructor(
    private readonly repo: Repo,
    private readonly ready: () => Promise<void> = () => repo.prepare(),
    private readonly fetchFile?: (snapshot: Snapshot, path: string) => Promise<void>,
  ) {}

  private async *chain(): AsyncGenerator<Snapshot> {
    let hash: string | null = await this.repo.getHeadFile().readText()
    const seen = new Set<string>()
    while (hash !== null) {
      if (!HASH.test(hash) || seen.has(hash)) throw illegalState('Invalid snapshot ancestry')
      seen.add(hash)
      const snapshot: Snapshot = await this.repo.getSnapshotFile(hash).readJSON<Snapshot>()
      if (snapshot.hash !== hash || snapshotHash(snapshot.parent, snapshot.files) !== hash)
        throw illegalState('Snapshot integrity check failed')
      yield snapshot
      hash = snapshot.parent
    }
  }

  async list(query: FileHistoryQuery): Promise<FileVersion[]> {
    await this.ready()
    return this.repo.exclusive(() => this.versions(query))
  }

  private async versions(query: FileHistoryQuery): Promise<FileVersion[]> {
    const result: FileVersion[] = []
    const paths = new Set('path' in query ? [query.path] : [])
    let previous: string | null = null
    for await (const snapshot of this.chain()) {
      const file =
        Object.values(snapshot.files).find((entry) =>
          'identity' in query ? entry.identity === query.identity : entry.pathname === query.path,
        ) ?? Object.values(snapshot.files).find((entry) => !entry.identity && paths.has(entry.pathname))
      if (!file) {
        previous = null
        continue
      }
      paths.add(file.pathname)
      const key = `${file.pathname}:${file.hash}`
      if (key === previous) continue
      previous = key
      result.push({ id: snapshot.hash, savedAt: snapshot.timestamp * 1000, hash: file.hash, path: file.pathname })
    }
    return result
  }

  async read(query: FileHistoryQuery, version: FileVersion): Promise<Uint8Array> {
    await this.ready()
    const { known, snapshot } = await this.repo.exclusive(async () => {
      // `version.id` already names its own snapshot — a content-addressed file that never changes once
      // written. Re-deriving it by walking `versions(query)` from the CURRENT head (as this used to)
      // made `read()` depend on the version still being reachable from wherever head is NOW, not just on
      // the one snapshot it actually points at: a checkpoint that `recordCheckpoint`'s optimistic retry
      // (see there) failed to link into head — its snapshot written, but head advancing to a sibling
      // that does not descend from it — reads back as "does not belong to the requested file" even
      // though the exact bytes `list()` showed a moment earlier are sitting on disk, untouched. Loading
      // the named snapshot directly and checking its OWN file entry answers the only question that
      // matters: does this snapshot really hold what `version` claims.
      let snapshot: Snapshot
      try {
        snapshot = await this.repo.getSnapshotFile(version.id).readJSON<Snapshot>()
      } catch {
        throw validation('This version does not belong to the requested file')
      }
      const file = snapshot.files[version.path]
      const belongs =
        file != null && file.hash === version.hash && ('identity' in query ? file.identity === query.identity : version.path === query.path)
      if (!belongs) throw validation('This version does not belong to the requested file')
      return { known: version, snapshot }
    })
    const file = snapshot.files[known.path]
    for (const chunk of file.chunks) {
      if (!HASH.test(chunk.hash)) throw illegalState('Invalid history chunk address')
      if (!(await this.repo.getChunkFile(chunk.hash).exists())) {
        if (!this.fetchFile) throw illegalState('Version content is unavailable offline. Connect to the sync server and retry.')
        await this.fetchFile(snapshot, known.path)
        break
      }
    }
    const chunks: Uint8Array[] = []
    for (const chunk of file.chunks) {
      const bytes = await this.repo.getChunkFile(chunk.hash).read()
      if (sha256(bytes) !== chunk.hash) throw illegalState('History chunk integrity check failed')
      chunks.push(bytes)
    }
    const content = new Uint8Array(chunks.reduce((size, bytes) => size + bytes.length, 0))
    let offset = 0
    for (const bytes of chunks) {
      content.set(bytes, offset)
      offset += bytes.length
    }
    if (sha256(content) !== file.hash) throw illegalState('History file integrity check failed')
    return content
  }

  async record(checkpoint: FileCheckpoint): Promise<void> {
    checkPath(checkpoint.path)
    await this.ready()
    await this.repo.exclusive(() => this.recordCheckpoint(checkpoint))
  }

  async save(before: FileCheckpoint, after: FileCheckpoint, write: () => Promise<void>): Promise<void> {
    checkPath(before.path)
    checkPath(after.path)
    await this.ready()
    await this.repo.exclusive(async () => {
      await this.recordCheckpoint(before)
      await write()
      await this.recordCheckpoint(after)
    })
  }

  private async recordCheckpoint(checkpoint: FileCheckpoint): Promise<void> {
    let imported: SnapshotFile | undefined
    if (checkpoint.source) {
      for await (const snapshot of this.chain()) {
        imported = Object.values(snapshot.files).find((file) => file.historySource === checkpoint.source)
        if (imported) break
      }
      if (imported && imported.hash !== sha256(checkpoint.content)) throw illegalState('Imported history source has changed')
    }
    const hash = sha256(checkpoint.content)
    // Content-addressed and independent of where head currently is, so this happens once — chunking
    // is the slow part, and doing it inside the retry loop below would only widen the window it exists
    // to close.
    const chunks: SnapshotFileChunk[] = []
    for await (const bytes of this.chunker.split({
      readable: async () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(checkpoint.content)
            controller.close()
          },
        }),
    })) {
      const chunkHash = sha256(bytes)
      const file = this.repo.getChunkFile(chunkHash)
      if (!(await file.exists()) || sha256(await file.read()) !== chunkHash) await file.write(bytes)
      chunks.push({ hash: chunkHash, size: bytes.byteLength })
    }
    if (imported) {
      // By hash only: an entry imported before sizes were recorded has none, and is still the same content.
      if (imported.chunks.map((chunk) => chunk.hash).join() !== chunks.map((chunk) => chunk.hash).join())
        throw illegalState('Imported history chunks differ; originals have been retained')
      return
    }
    // `exclusive()` serializes calls made through THIS `Repo` instance, but the head pointer lives in
    // the store it reads and writes through — the same file a second tab, or a second device pointed at
    // the same server, reaches directly. Reading head, then writing a NEW head an entire chunking pass
    // later, left a window wide enough for one of those to advance head first; this device's own
    // checkpoint then wrote its new snapshot but never linked it in, silently dropping it from history
    // (a `Saved versions` list one entry short, or a version nobody can read back). There is no
    // compare-and-swap this store offers, so the fix is optimistic concurrency: read head again right
    // before the write, and start over against whatever it now is if it moved. That turns a multi-step
    // race into a single read-then-write one, which is what makes it rare enough in practice.
    for (;;) {
      const head = await this.repo.getHeadSnapshot()
      const previous = head.files[checkpoint.path]
      if (!checkpoint.source && previous?.hash === hash && previous.identity === checkpoint.identity) return
      const files = { ...head.files }
      if (checkpoint.identity) {
        for (const [path, file] of Object.entries(files)) {
          if (file.identity === checkpoint.identity && path !== checkpoint.path) delete files[path]
        }
      }
      files[checkpoint.path] = {
        fileId: previous?.fileId ?? crypto.randomUUID(),
        pathname: checkpoint.path,
        hash,
        size: checkpoint.content.byteLength,
        chunks,
        ...(checkpoint.identity ? { identity: checkpoint.identity } : {}),
        ...(checkpoint.source ? { historySource: checkpoint.source } : {}),
      }
      const snapshot: Snapshot = {
        parent: head.hash,
        files,
        hash: snapshotHash(head.hash, files),
        timestamp: (checkpoint.savedAt ?? Date.now()) / 1000,
      }
      await this.repo.getSnapshotFile(snapshot.hash).writeJSON(snapshot)
      const current = await this.repo
        .getHeadFile()
        .readText()
        .catch(() => null)
      if (current !== head.hash) continue
      await this.repo.getHeadFile().writeText(snapshot.hash)
      return
    }
  }
}
