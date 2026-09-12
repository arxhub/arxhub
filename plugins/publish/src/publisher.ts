import type { Logger } from '@arxhub/core'
import { illegalState } from '@arxhub/errors'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { stableStringify } from '@arxhub/stdlib/record/stable-stringify'
import { Chunker, type SnapshotFile, type SyncRemote } from '@arxhub/sync'
import type { VirtualFile, VirtualFileSystem } from '@arxhub/vfs'
import type { PublishManifest } from './publish-manifest'
import { arxAssetPaths, arxReader } from './server/arx-reader'

const ROOTS_FILE = '/published.json'
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
}

// Publishes vault content as an UNENCRYPTED, content-addressed public site: each file is Rabin-
// chunked (same chunker as sync), the plaintext chunks are uploaded to the public object store, and
// a manifest (path → chunk list) is uploaded and pointed to by the store head. On read the server
// reassembles a whole file from the manifest; .arx gets a read-only page and a source download.
// Publishing DELIBERATELY takes the selected subtree out of E2E:
// that is the feature. Chunking means republishing only uploads changed chunks.
export class Publisher {
  private readonly vault: VirtualFileSystem
  private readonly storage: VirtualFileSystem
  private readonly remote: SyncRemote
  private readonly logger: Logger
  private readonly chunker = new Chunker()
  private roots = new Set<string>()
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
  }

  async load(): Promise<void> {
    const roots = await this.storage.file(ROOTS_FILE).readJSON<string[]>([])
    this.roots = new Set(roots)
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

  publish(path: string): Promise<void> {
    return this.changeRoots((roots) => roots.add(path), `Published ${path}`)
  }

  unpublish(path: string): Promise<void> {
    return this.changeRoots((roots) => {
      for (const root of roots) if (root === path || root.startsWith(`${path}/`)) roots.delete(root)
    }, `Unpublished ${path}`)
  }

  private changeRoots(change: (roots: Set<string>) => void, message: string): Promise<void> {
    const operation = this.pending.then(async () => {
      const roots = new Set(this.roots)
      change(roots)
      await this.rebuild(roots)
      this.roots = roots
      this.logger.info(message)
    })
    this.pending = operation.catch(() => {})
    return operation
  }

  // Rebuild the whole manifest from the current root set and push the delta. Full-rebuild (not
  // incremental) keeps the manifest authoritative and simple; chunk dedup via hasObjects means an
  // unchanged file re-uploads nothing.
  private async rebuild(roots: Set<string>): Promise<void> {
    const files: Record<string, SnapshotFile> = {}
    const chunks = new Map<string, Uint8Array>()

    const sources = new Map<string, string>()
    const attachments = new Set<string>()
    const consume = async (file: VirtualFile) => {
      if (files[file.pathname]) return
      if (this.beforeRead && !(await this.beforeRead(file.pathname))) throw illegalState('Save or recover open documents before publishing')
      const fileChunks: { hash: string }[] = []
      const source: Uint8Array[] = []
      const arx = file.pathname.toLowerCase().endsWith('.arx')
      for await (const chunk of this.chunker.split(file)) {
        const hash = sha256(chunk)
        if (!chunks.has(hash)) chunks.set(hash, chunk)
        fileChunks.push({ hash })
        if (arx) source.push(chunk)
      }
      const fileHash = (await file.info.get('hash')) ?? sha256(await file.read())
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
    try {
      await this.commit(manifestHash)
    } catch (error) {
      await this.storage.file(ROOTS_FILE).writeJSON([...this.roots])
      throw error
    }
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
  private async commit(manifestHash: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const expected = await this.remote.getHead()
      if (expected === manifestHash) return // already current (idempotent republish)
      if (await this.remote.setHead(expected, manifestHash)) return
    }
    throw illegalState('Publish head moved during upload — try publishing again')
  }
}
