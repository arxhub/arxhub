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
      const known = (await this.versions(query)).find(
        (entry) => entry.id === version.id && entry.path === version.path && entry.hash === version.hash,
      )
      if (!known) throw validation('This version does not belong to the requested file')
      const snapshot = await this.repo.getSnapshotFile(known.id).readJSON<Snapshot>()
      return { known, snapshot }
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
    const head = await this.repo.getHeadSnapshot()
    const hash = sha256(checkpoint.content)
    const previous = head.files[checkpoint.path]
    if (!checkpoint.source && previous?.hash === hash && previous.identity === checkpoint.identity) return
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
    await this.repo.getHeadFile().writeText(snapshot.hash)
  }
}
