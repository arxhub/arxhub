import { createEventBus, type TypedEventBus, type Unsubscribe } from '@arxhub/events'
import type { Logger } from '@arxhub/logger'
import { sha256 } from '@arxhub/stdlib/crypto/sha256'
import type { VirtualFileSystem } from '@arxhub/vfs'
import { detectDocumentKind, documentPath, type ParsedDocument } from './document'
import { removeDocument, removeDocumentsUnder, writeDocument } from './index-document'
import { metadataDocument, parseDocument } from './parse-document'
import { isIndexablePath } from './path-filter'
import { CONTENT_TABLES } from './schema'
import type { SqlIndex } from './types'

export const SCAN_CURSOR_KEY = 'scan_cursor'
export const LAST_SCAN_STARTED_AT_KEY = 'last_scan_started_at'
export const LAST_SCAN_FINISHED_AT_KEY = 'last_scan_finished_at'

// A file larger than this is indexed by its metadata alone. 2 MiB of prose is a book; past it the file
// is far more likely to be something the parser would chew through for nothing.
export const DEFAULT_MAX_FILE_SIZE = 2 * 1024 * 1024

// Documents per checkpoint: how often the walk saves its cursor and hands the thread back so the
// interface stays responsive (FR-223).
export const DEFAULT_BATCH_SIZE = 32

export type IndexerState = 'idle' | 'scanning'

export interface IndexerStatus {
  state: IndexerState
  // Files handled by the walk that is running (or the one that finished last).
  processed: number
  documentCount: number
  lastScanStartedAt: Date | null
  lastScanFinishedAt: Date | null
}

// The tunables of the walk. Every one of them is a setting the owner can change while the app is up, so
// they are not constructor-only — see `Indexer.configure`.
export interface IndexerOptions {
  // Path masks that are not indexed.
  exclude?: readonly string[]
  maxFileSize?: number
  batchSize?: number
}

export interface Indexer {
  // A snapshot, replaced whole on every change — a subscriber can compare two of them.
  readonly status: IndexerStatus
  // The walk in flight, if there is one. Something shutting down cancels and then awaits this: the walk
  // holds transactions, and closing the index under it would fail them.
  readonly running: Promise<unknown> | null
  subscribe(listener: (status: IndexerStatus) => void): Unsubscribe
  // Catches the index up with the content store, resuming an unfinished walk. Calling it while a walk is
  // running joins that walk rather than starting a second one (FR-226).
  scan(): Promise<IndexerStatus>
  // Throws the index away and walks from the start.
  reindex(): Promise<IndexerStatus>
  // One file, written or arrived (FR-225).
  indexPath(pathname: string): Promise<void>
  removePath(pathname: string): Promise<void>
  // Asks a running walk to stop at the next file, leaving its cursor saved so the next one resumes.
  cancel(): void
  // Replaces the tunables above; anything left out keeps its current value. Only makes the new rule live
  // from here on — `exclude` and `maxFileSize` decide what the index CONTAINS, so a caller that changes
  // either has to rebuild as well, or the rows the old rule admitted stay.
  configure(options: IndexerOptions): void
}

export interface CreateIndexerOptions extends IndexerOptions {
  logger: Logger
}

// The indexer's own event map. Local rather than the application-wide bus: a status belongs to the walk
// that produced it, and an app that opened a second index would otherwise have its two indexers
// overwriting each other's status in every subscriber.
interface IndexerEvents {
  status: IndexerStatus
}

// The walk over the content store. `vfs` must be the view of the content store, never the whole tree:
// plugin buckets, device-local state and sync objects are not documents (FR-219).
export function createIndexer(index: SqlIndex, vfs: VirtualFileSystem, options: CreateIndexerOptions): Indexer {
  return new VaultIndexer(index, vfs, options)
}

interface DocumentState {
  size: number
  mtime: number
  hash: string | null
}

class VaultIndexer implements Indexer {
  private readonly index: SqlIndex
  private readonly vfs: VirtualFileSystem
  private readonly logger: Logger
  private exclude: readonly string[] = []
  private maxFileSize: number = DEFAULT_MAX_FILE_SIZE
  private batchSize: number = DEFAULT_BATCH_SIZE

  private snapshot: IndexerStatus = {
    state: 'idle',
    processed: 0,
    documentCount: 0,
    lastScanStartedAt: null,
    lastScanFinishedAt: null,
  }
  // A subscriber that throws is reported and skipped: the walk announces its status from inside a
  // transaction it still has to finish, and a status listener is a UI concern that must not fail it.
  private readonly events: TypedEventBus<IndexerEvents> = createEventBus<IndexerEvents>({
    onError: (error) => this.logger.error({ err: error }, 'An indexer status listener threw'),
  })
  private inflight: Promise<IndexerStatus> | null = null
  private cancelled = false

  constructor(index: SqlIndex, vfs: VirtualFileSystem, options: CreateIndexerOptions) {
    this.index = index
    this.vfs = vfs
    this.logger = options.logger
    this.configure(options)
  }

  configure(options: IndexerOptions): void {
    // Each key is applied only when it was given, so a caller that wants to change one tunable does not
    // have to restate the other two — and cannot silently reset them to the defaults.
    if (options.exclude !== undefined) {
      this.exclude = options.exclude.map((pattern) => pattern.trim()).filter((pattern) => pattern !== '')
    }
    if (options.maxFileSize !== undefined) this.maxFileSize = positiveInteger(options.maxFileSize, DEFAULT_MAX_FILE_SIZE)
    if (options.batchSize !== undefined) this.batchSize = positiveInteger(options.batchSize, DEFAULT_BATCH_SIZE)
  }

  get status(): IndexerStatus {
    return this.snapshot
  }

  get running(): Promise<unknown> | null {
    return this.inflight
  }

  subscribe(listener: (status: IndexerStatus) => void): Unsubscribe {
    return this.events.on('status', listener)
  }

  scan(): Promise<IndexerStatus> {
    // A second walk over the same store would read every file twice and race itself over the cursor, so
    // the caller joins the one already running (FR-226).
    if (this.inflight != null) return this.inflight
    return this.track(this.runScan())
  }

  reindex(): Promise<IndexerStatus> {
    const previous = this.inflight
    // The walk in flight is filling an index that is about to be dropped, so it is stopped rather than
    // joined — and awaited, because it holds transactions of its own.
    this.cancel()
    return this.track(
      (async () => {
        if (previous != null) await previous.catch(() => undefined)
        await this.clear()
        // runScan clears the cancel flag, so the stop above does not carry into this walk.
        return this.runScan()
      })(),
    )
  }

  private track(run: Promise<IndexerStatus>): Promise<IndexerStatus> {
    const tracked = run.finally(() => {
      // Guarded: a reindex started while this one was finishing already owns the slot.
      if (this.inflight === tracked) this.inflight = null
    })
    this.inflight = tracked
    return tracked
  }

  private async clear(): Promise<void> {
    await this.index.transaction(async (tx) => {
      // CONTENT_TABLES is children-first; the cascade would cover it either way.
      for (const table of CONTENT_TABLES) {
        await tx.exec(`DELETE FROM ${table}`)
      }
      await tx.query('DELETE FROM index_meta WHERE key IN ($1, $2, $3)', [SCAN_CURSOR_KEY, LAST_SCAN_STARTED_AT_KEY, LAST_SCAN_FINISHED_AT_KEY])
    })
    this.patch({ processed: 0, documentCount: 0, lastScanStartedAt: null, lastScanFinishedAt: null })
  }

  async indexPath(pathname: string): Promise<void> {
    const path = documentPath(pathname)
    if (!isIndexablePath(path, this.exclude)) return
    if (!(await this.vfs.exists(path))) {
      await this.removePath(path)
      return
    }
    // force: a save that happens to leave the size and the timestamp alone still changed the file, and
    // the caller here is telling us it did.
    await this.indexFile(path, true)
    await this.refreshDocumentCount()
  }

  // Both, always: the caller reports a path that is gone, and a path that is gone cannot be asked whether
  // it was a file or a folder. A folder arrives as a single change on its own path, so dropping only the
  // exact row would leave every note inside it answering searches; a file has nothing below it, so the
  // second delete costs one statement and matches nothing.
  async removePath(pathname: string): Promise<void> {
    await removeDocument(this.index, pathname)
    await removeDocumentsUnder(this.index, pathname)
    await this.refreshDocumentCount()
  }

  cancel(): void {
    this.cancelled = true
  }

  private async runScan(): Promise<IndexerStatus> {
    this.cancelled = false
    const startedAt = Date.now()
    // A cursor left behind means the previous run was interrupted; the walk picks up where it stopped
    // instead of reading the whole store again (FR-223).
    const cursor = await this.readMeta(SCAN_CURSOR_KEY)
    await this.writeMeta(LAST_SCAN_STARTED_AT_KEY, String(startedAt))
    this.patch({ state: 'scanning', processed: 0, lastScanStartedAt: new Date(startedAt) })
    await this.refreshDocumentCount()

    const walker = this.vfs.walk('', cursor ?? undefined)
    const visited = new Set<string>()
    let sinceCheckpoint = 0

    try {
      while (!this.cancelled) {
        const file = await walker.next()
        if (file == null) break

        const path = documentPath(file.pathname)
        if (!isIndexablePath(path, this.exclude)) continue
        visited.add(path)

        try {
          await this.indexFile(path, false)
        } catch (error) {
          // One file that will not parse does not end the walk: it is logged, indexed by its metadata so
          // it stays findable by name, and the walk moves on.
          this.logger.warn({ path, err: error }, 'Could not index a file — indexing its metadata only')
          await this.indexMetadataOnly(path)
        }

        this.patch({ processed: this.snapshot.processed + 1 })
        sinceCheckpoint += 1
        if (sinceCheckpoint >= this.batchSize) {
          sinceCheckpoint = 0
          await this.writeMeta(SCAN_CURSOR_KEY, walker.cursor())
          await this.refreshDocumentCount()
          await yieldToEventLoop()
        }
      }

      if (this.cancelled) {
        // Saved, not cleared: the next run continues from here rather than starting over.
        await this.writeMeta(SCAN_CURSOR_KEY, walker.cursor())
      } else {
        await this.sweep(visited)
        await this.writeMeta(SCAN_CURSOR_KEY, '')
        const finishedAt = Date.now()
        await this.writeMeta(LAST_SCAN_FINISHED_AT_KEY, String(finishedAt))
        this.patch({ lastScanFinishedAt: new Date(finishedAt) })
      }
      await this.refreshDocumentCount()
    } finally {
      this.patch({ state: 'idle' })
    }

    return this.snapshot
  }

  private async indexFile(path: string, force: boolean): Promise<void> {
    const head = await this.vfs.head(path)
    const stat = { size: head.size, mtime: head.modifiedAt, ctime: head.createdAt }
    const existing = await this.readDocumentState(path)
    const kind = detectDocumentKind(path)

    // Same path, same size, same modification time — nothing to read (FR-224).
    //
    // Except one case: a row with no hash. A hash only appears after a real parse, so its absence on an
    // otherwise-indexable file within the size limit means the parse never actually happened — the row
    // was written from metadata alone after some earlier failure. Without this check that row was stuck
    // forever: size and mtime already matched, so the file was never read again, staying in the index
    // with no text and no title. A transient failure has no business becoming a permanent one.
    const unparsed = existing != null && existing.hash == null && kind !== 'binary' && stat.size <= this.maxFileSize
    if (!force && !unparsed && existing != null && existing.size === stat.size && existing.mtime === stat.mtime) return

    if (kind === 'binary') {
      // Nothing in the file would be read, so it is not read: hashing a video to learn it is still a
      // video costs a full pass over it.
      await this.write(metadataDocument(path, stat, kind))
      return
    }
    if (stat.size > this.maxFileSize) {
      await this.write(metadataDocument(path, stat, kind))
      return
    }

    const bytes = await this.vfs.read(path)
    const hash = sha256(bytes)
    if (existing != null && existing.hash === hash) {
      // The file was touched but says the same thing — an edit and an undo, or a sync that rewrote it.
      await this.index.query('UPDATE document SET size = $2, mtime = $3, indexed_at = now() WHERE path = $1', [path, stat.size, stat.mtime])
      return
    }

    await this.write(parseDocument(path, bytes, stat))
  }

  private async indexMetadataOnly(path: string): Promise<void> {
    try {
      const head = await this.vfs.head(path)
      await this.write(metadataDocument(path, { size: head.size, mtime: head.modifiedAt, ctime: head.createdAt }))
    } catch (error) {
      // The file itself is unreadable now — there is nothing left to record about it.
      this.logger.warn({ path, err: error }, 'Could not read a file at all — leaving it out of the index')
    }
  }

  private async write(doc: ParsedDocument): Promise<void> {
    await this.index.transaction(async (tx) => {
      await writeDocument(tx, doc)
    })
  }

  // Rows whose file is gone, or whose path the walk no longer indexes. Checked by existence rather than
  // by "everything the walk did not see": a resumed walk only sees the tail of the store, and deleting
  // what it missed would empty the index.
  private async sweep(visited: ReadonlySet<string>): Promise<void> {
    const { rows } = await this.index.query<{ path: string }>('SELECT path FROM document')
    const stale: string[] = []
    for (const { path } of rows) {
      if (visited.has(path)) continue
      if (!isIndexablePath(path, this.exclude) || !(await this.vfs.exists(path))) stale.push(path)
    }
    for (const path of stale) {
      await this.index.query('DELETE FROM document WHERE path = $1', [path])
    }
  }

  private async readDocumentState(path: string): Promise<DocumentState | null> {
    // size and mtime are bigint columns, which the driver hands back as a string; float8 comes back as a
    // number, and both values are far inside what a double holds exactly.
    const { rows } = await this.index.query<{ size: number; mtime: number; hash: string | null }>(
      'SELECT size::float8 AS size, mtime::float8 AS mtime, hash FROM document WHERE path = $1',
      [path],
    )
    const row = rows[0]
    return row == null ? null : { size: Number(row.size), mtime: Number(row.mtime), hash: row.hash }
  }

  private async refreshDocumentCount(): Promise<void> {
    if (this.index.closed) return
    try {
      const { rows } = await this.index.query<{ count: number }>('SELECT count(*)::int AS count FROM document')
      this.patch({ documentCount: rows[0]?.count ?? 0 })
    } catch (error) {
      this.logger.debug({ err: error }, 'Could not read the document count')
    }
  }

  private async readMeta(key: string): Promise<string | null> {
    const { rows } = await this.index.query<{ value: string }>('SELECT value FROM index_meta WHERE key = $1', [key])
    const value = rows[0]?.value
    return value == null || value === '' ? null : value
  }

  private async writeMeta(key: string, value: string): Promise<void> {
    await this.index.query('INSERT INTO index_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [
      key,
      value,
    ])
  }

  private patch(changes: Partial<IndexerStatus>): void {
    this.snapshot = { ...this.snapshot, ...changes }
    this.events.emit('status', this.snapshot)
  }
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  const rounded = Math.trunc(value)
  return rounded > 0 ? rounded : fallback
}

// Hands the thread back to the event loop. A macrotask rather than a microtask: a promise queue drains
// before the browser paints, so `await Promise.resolve()` would leave the window just as frozen.
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}
