import type { Logger } from '@arxhub/core'
import { illegalState } from '@arxhub/errors'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import { stableStringify } from '@arxhub/stdlib/record/stable-stringify'
import { Chunker, type SnapshotFile, type SyncRemote } from '@arxhub/sync'
import type { VirtualFileSystem } from '@arxhub/vfs'
import type { PublishManifest } from './publish-manifest'

const ROOTS_FILE = '/published.json'
const STAT_BATCH = 512
const PUT_BATCH_BYTES = 16 * 1024 * 1024

const encoder = new TextEncoder()

export type PublisherOptions = {
  // User content (plaintext source) — the same namespace the explorer shows. Publish uploads the
  // RAW source bytes (not rendered HTML); rendering happens server-side at read time.
  vault: VirtualFileSystem
  // Plugin storage (SYNCED): the set of published root paths lives here so every device agrees on
  // what is public and any device can rebuild + republish the manifest.
  storage: VirtualFileSystem
  // Unencrypted content-addressed store on the server (an HttpSyncRemote at `<origin>/publish` with
  // NO EncryptedSyncRemote wrapper). Chunks + the manifest land here as plaintext public objects.
  remote: SyncRemote
  logger: Logger
}

// Publishes vault content as an UNENCRYPTED, content-addressed public site: each file is Rabin-
// chunked (same chunker as sync), the plaintext chunks are uploaded to the public object store, and
// a manifest (path → chunk list) is uploaded and pointed to by the store head. The server reassembles
// files from the manifest and renders them at read time. Publishing DELIBERATELY takes the selected
// subtree out of E2E — that is the feature. Chunking means republishing only uploads changed chunks.
export class Publisher {
  private readonly vault: VirtualFileSystem
  private readonly storage: VirtualFileSystem
  private readonly remote: SyncRemote
  private readonly logger: Logger
  private readonly chunker = new Chunker()
  private roots = new Set<string>()

  constructor(options: PublisherOptions) {
    this.vault = options.vault
    this.storage = options.storage
    this.remote = options.remote
    this.logger = options.logger
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

  async publish(path: string): Promise<void> {
    this.roots.add(path)
    await this.rebuild()
    this.logger.info(`Published ${path}`)
  }

  async unpublish(path: string): Promise<void> {
    // Drop the exact root plus any roots nested under it (unpublishing a parent unpublishes children).
    for (const root of [...this.roots]) {
      if (root === path || root.startsWith(`${path}/`)) this.roots.delete(root)
    }
    await this.rebuild()
    this.logger.info(`Unpublished ${path}`)
  }

  // Rebuild the whole manifest from the current root set and push the delta. Full-rebuild (not
  // incremental) keeps the manifest authoritative and simple; chunk dedup via hasObjects means an
  // unchanged file re-uploads nothing.
  private async rebuild(): Promise<void> {
    await this.storage.file(ROOTS_FILE).writeJSON([...this.roots])

    const files: Record<string, SnapshotFile> = {}
    const chunks = new Map<string, Uint8Array>()

    for (const root of this.roots) {
      for await (const file of this.vault.walk(root)) {
        const fileChunks: { hash: string }[] = []
        for await (const chunk of this.chunker.split(file)) {
          const hash = sha256(chunk)
          if (!chunks.has(hash)) chunks.set(hash, chunk)
          fileChunks.push({ hash })
        }
        const fileHash = (await file.info.get('hash')) ?? sha256(await file.read())
        files[file.pathname] = { hash: fileHash, pathname: file.pathname, chunks: fileChunks }
      }
    }

    const manifest: PublishManifest = { version: 1, roots: [...this.roots], files }
    const manifestBytes = encoder.encode(stableStringify(manifest))
    const manifestHash = sha256(manifestBytes)

    await this.upload(chunks, manifestHash, manifestBytes)
    await this.commit(manifestHash)
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
