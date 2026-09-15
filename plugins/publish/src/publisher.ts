import type { Logger } from '@arxhub/core'
import { createHasher } from '@arxhub/crypto'
import { illegalState } from '@arxhub/errors'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { stableStringify } from '@arxhub/stdlib/record/stable-stringify'
import { Chunker, type SnapshotFile, type SyncRemote } from '@arxhub/sync'
import type { VirtualFile, VirtualFileSystem } from '@arxhub/vfs'
import { appendHistory, historyLimit, type PublicationKind, type PublicationRecord, sanitizeHistory } from './publish-history'
import type { PublishManifest } from './publish-manifest'
import { arxAssetPaths, arxReader } from './server/arx-reader'

const ROOTS_FILE = '/published.json'
const HISTORY_FILE = '/history.json'
const STAT_BATCH = 512
const PUT_BATCH_BYTES = 16 * 1024 * 1024

const encoder = new TextEncoder()

export type PublisherOptions = {
  // User content (plaintext source) — the same namespace the explorer shows. What is uploaded is the
  // source itself, chunked; the public reader renders .arx without changing these bytes.
  vault: VirtualFileSystem
  // Plugin storage (SYNCED): the set of published root paths lives here so every device agrees on
  // what is public and any device can rebuild + republish the manifest.
  storage: VirtualFileSystem
  // Unencrypted content-addressed store on the server (an HttpSyncRemote at `<origin>/publish` with
  // NO EncryptedSyncRemote wrapper). Chunks + the manifest land here as plaintext public objects.
  remote: SyncRemote
  logger: Logger
  render?: (raw: string, path: string) => { html: string; status: number }
  beforeRead?: (path: string) => Promise<boolean>
  // How many head commits history.json remembers (`history.limit` in the plugin's config).
  historyLimit?: number
}

// Publishes vault content as an UNENCRYPTED, content-addressed public site: each file is Rabin-
// chunked (same chunker as sync), the plaintext chunks are uploaded to the public object store, and
// a manifest (path → chunk list) is uploaded and pointed to by the store head. On read the server
// reassembles a whole file from the manifest; .arx gets a read-only page and a source download.
// Publishing DELIBERATELY takes the selected subtree out of E2E:
// that is the feature. Chunking means republishing only uploads changed chunks.
//
// Every head commit is also written down in history.json, newest first, and any entry can be made the
// head again: objects are never deleted from the public store, so an old manifest still resolves, and a
// rollback is nothing more than the same compare-and-swap pointed backwards plus that entry's root set.
export class Publisher {
  private readonly vault: VirtualFileSystem
  private readonly storage: VirtualFileSystem
  private readonly remote: SyncRemote
  private readonly logger: Logger
  private readonly chunker = new Chunker()
  private readonly historyLimit: number
  private roots = new Set<string>()
  private records: PublicationRecord[] = []
  private pending: Promise<void> = Promise.resolve()
  private readonly render: (raw: string, path: string) => { html: string; status: number }
  private readonly beforeRead?: (path: string) => Promise<boolean>

  constructor(options: PublisherOptions) {
    this.vault = options.vault
    this.storage = options.storage
    this.remote = options.remote
    this.logger = options.logger
    this.render = options.render ?? ((raw, path) => arxReader(raw, path))
    this.beforeRead = options.beforeRead
    this.historyLimit = historyLimit(options.historyLimit)
  }

  async load(): Promise<void> {
    this.roots = await this.readRoots()
    this.records = await this.readHistory()
  }

  // Both files are shared state — another device writes them through sync — so every operation starts from
  // what is on disk now, not from what this instance loaded at boot: a republish from a set that went stale
  // would silently unpublish whatever the other device had shared since.
  private async readRoots(): Promise<Set<string>> {
    return new Set(await this.storage.file(ROOTS_FILE).readJSON<string[]>([]))
  }

  private async readHistory(): Promise<PublicationRecord[]> {
    return sanitizeHistory(await this.storage.file(HISTORY_FILE).readJSON<unknown>([]))
  }

  isPublished(path: string): boolean {
    // A path is "published" if it is an explicit root OR lives under one.
    for (const root of this.roots) {
      if (path === root || path.startsWith(`${root}/`)) return true
    }
    return false
  }

  list(): string[] {
    return [...this.roots]
  }

  // Newest first. The first entry is the head as far as this record knows.
  history(): PublicationRecord[] {
    return [...this.records]
  }

  publish(path: string): Promise<void> {
    return this.changeRoots((roots) => roots.add(path), 'publish', `Published ${path}`)
  }

  unpublish(path: string): Promise<void> {
    return this.changeRoots(
      (roots) => {
        for (const root of roots) if (root === path || root.startsWith(`${path}/`)) roots.delete(root)
      },
      'unpublish',
      `Unpublished ${path}`,
    )
  }

  // Make a remembered manifest the head again. No retry, unlike a publish: the head having moved means
  // the history this device chose from is no longer the whole story, so the person looks again first.
  rollback(hash: string): Promise<void> {
    const operation = this.pending.then(async () => {
      this.records = await this.readHistory()
      const entry = this.records.find((it) => it.hash === hash)
      if (entry == null) throw illegalState(`Publication ${hash.slice(0, 8)} is not in the history`)
      // The bookmark can outlive the object — a server wiped and re-paired, say — and a head pointing at
      // nothing would 404 every reader at once.
      if (!(await this.remote.hasObjects([hash])).has(hash)) throw illegalState(`The server no longer holds publication ${hash.slice(0, 8)}`)
      const current = await this.remote.getHead()
      if (!(await this.remote.setHead(current, hash))) {
        throw illegalState('The publication changed on another device since this history was read — look at it again before rolling back')
      }
      const roots = new Set(entry.roots)
      await this.storage.file(ROOTS_FILE).writeJSON([...roots])
      this.roots = roots
      await this.record({ hash, at: new Date().toISOString(), roots: [...roots], files: entry.files, kind: 'rollback' })
      this.logger.info(`Rolled the publication back to ${hash.slice(0, 8)}`)
    })
    this.pending = operation.catch(() => {})
    return operation
  }

  private changeRoots(change: (roots: Set<string>) => void, kind: PublicationKind, message: string): Promise<void> {
    const operation = this.pending.then(async () => {
      this.roots = await this.readRoots()
      this.records = await this.readHistory()
      const roots = new Set(this.roots)
      change(roots)
      await this.rebuild(roots, kind)
      this.roots = roots
      this.logger.info(message)
    })
    this.pending = operation.catch(() => {})
    return operation
  }

  // After the commit, never before: an entry for a head that did not move would offer a rollback to a
  // state the server never had. A write that fails here is logged rather than thrown — the publication
  // itself went through, and "Could not publish" would be a lie about it.
  private async record(entry: PublicationRecord): Promise<void> {
    this.records = appendHistory(this.records, entry, this.historyLimit)
    try {
      await this.storage.file(HISTORY_FILE).writeJSON(this.records)
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'The publication went through, but its history entry could not be written',
      )
    }
  }

  // Rebuild the whole manifest from the current root set and push the delta. Full-rebuild (not
  // incremental) keeps the manifest authoritative and simple; chunk dedup via hasObjects means an
  // unchanged file re-uploads nothing.
  private async rebuild(roots: Set<string>, kind: PublicationKind): Promise<void> {
    const files: Record<string, SnapshotFile> = {}
    const chunks = new Map<string, Uint8Array>()

    const sources = new Map<string, string>()
    const attachments = new Set<string>()
    const consume = async (file: VirtualFile) => {
      if (files[file.pathname]) return
      if (this.beforeRead && !(await this.beforeRead(file.pathname))) throw illegalState('Save or recover open documents before publishing')
      const fileChunks: { hash: string; size: number }[] = []
      const source: Uint8Array[] = []
      const arx = file.pathname.toLowerCase().endsWith('.arx')
      // The file's own hash is taken in the same pass as its chunks — one read, whatever the size.
      const hasher = createHasher('sha256')
      for await (const chunk of this.chunker.split(file)) {
        const hash = sha256(chunk)
        hasher.update(chunk)
        if (!chunks.has(hash)) chunks.set(hash, chunk)
        fileChunks.push({ hash, size: chunk.byteLength })
        if (arx) source.push(chunk)
      }
      const fileHash = await hasher.digest('hex')
      files[file.pathname] = { hash: fileHash, pathname: file.pathname, chunks: fileChunks }
      if (arx) {
        const bytes = new Uint8Array(source.reduce((size, part) => size + part.length, 0))
        let offset = 0
        for (const part of source) {
          bytes.set(part, offset)
          offset += part.length
        }
        files[file.pathname].hash = sha256(bytes)
        const raw = new TextDecoder().decode(bytes)
        sources.set(file.pathname, raw)
        try {
          for (const asset of arxAssetPaths(raw)) attachments.add(asset)
        } catch {
          /* Invalid sources still offer their original download. */
        }
      }
    }
    for (const root of roots) for await (const file of this.vault.walk(root)) await consume(file)
    for (const asset of attachments) await consume(this.vault.file(asset))
    const rendered: Record<string, SnapshotFile & { status: number }> = {}
    for (const [path, raw] of sources) {
      const page = this.render(raw, path)
      const bytes = encoder.encode(page.html)
      const renderedChunks: { hash: string }[] = []
      for (let offset = 0; offset < bytes.length; offset += 1024 * 1024) {
        const chunk = bytes.slice(offset, offset + 1024 * 1024)
        const hash = sha256(chunk)
        chunks.set(hash, chunk)
        renderedChunks.push({ hash })
      }
      rendered[path] = { status: page.status, hash: sha256(bytes), pathname: path, chunks: renderedChunks }
    }
    const manifest: PublishManifest = { version: 1, roots: [...roots], files, ...(sources.size ? { rendered } : {}) }
    const manifestBytes = encoder.encode(stableStringify(manifest))
    const manifestHash = sha256(manifestBytes)

    await this.upload(chunks, manifestHash, manifestBytes)
    await this.storage.file(ROOTS_FILE).writeJSON([...roots])
    let moved: boolean
    try {
      moved = await this.commit(manifestHash)
    } catch (error) {
      await this.storage.file(ROOTS_FILE).writeJSON([...this.roots])
      throw error
    }
    if (moved)
      await this.record({ hash: manifestHash, at: new Date().toISOString(), roots: [...roots], files: Object.keys(files).length, kind })
  }

  // Upload the manifest + every referenced chunk the server lacks, in bounded batches. The manifest
  // is stored under its own hash like any other object; the head then points at it.
  private async upload(chunks: Map<string, Uint8Array>, manifestHash: string, manifestBytes: Uint8Array): Promise<void> {
    const candidates = [manifestHash, ...chunks.keys()]
    const missing = new Set<string>()
    for (let i = 0; i < candidates.length; i += STAT_BATCH) {
      const batch = candidates.slice(i, i + STAT_BATCH)
      const has = await this.remote.hasObjects(batch)
      for (const hash of batch) {
        if (!has.has(hash)) missing.add(hash)
      }
    }

    let payload = new Map<string, Uint8Array>()
    let payloadBytes = 0
    const flush = async (): Promise<void> => {
      if (payload.size === 0) return
      await this.remote.putObjects(payload)
      payload = new Map()
      payloadBytes = 0
    }
    for (const [hash, bytes] of chunks) {
      if (!missing.has(hash)) continue
      payload.set(hash, bytes)
      payloadBytes += bytes.length
      if (payloadBytes >= PUT_BATCH_BYTES) await flush()
    }
    // Manifest last: it is the entry point, so it must not exist until its chunks are all present.
    if (missing.has(manifestHash)) payload.set(manifestHash, manifestBytes)
    await flush()
  }

  // Point the store head at the new manifest. Publish is single-owner, but another device may have
  // republished concurrently, so use the store's compare-and-swap and retry once against a fresh head.
  // False when the head already was this manifest (an idempotent republish) — nothing to remember.
  private async commit(manifestHash: string): Promise<boolean> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const expected = await this.remote.getHead()
      if (expected === manifestHash) return false
      if (await this.remote.setHead(expected, manifestHash)) return true
    }
    throw illegalState('Publish head moved during upload — try publishing again')
  }
}
