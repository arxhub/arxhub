import type { LogBuffer, Logger, LogRecord } from '@arxhub/logger'
import { posix } from '@arxhub/path'
import { appendEntry, type VirtualFileSystem } from '@arxhub/vfs'

const LOGS_DIR = 'logs'
const KEEP_SESSIONS = 10
const FLUSH_MS = 750
const SESSION_RE = /session-.*\.ndjson$/

// Epoch millis → filesystem-safe, lexically-sortable session id (e.g. 2026-06-25T12-30-01-123Z).
function sessionId(now: number): string {
  return new Date(now).toISOString().replace(/[:.]/g, '-')
}

// Persists captured log records to an NDJSON file under the plugin's device-local `state/logs/`.
// Appends only *new* records (collected from the buffer subscription) so the file accumulates the
// full session while the in-memory buffer stays a small live window. Uses the VFS `append`
// capability (native on Node, read+rewrite fallback elsewhere). Logging must never throw into the
// app, so write failures are logged and the batch re-queued.
export class LogFileWriter {
  private currentPath = ''
  private pending: LogRecord[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private flushing: Promise<void> = Promise.resolve()
  private unsubscribe: (() => void) | null = null
  private readonly encoder = new TextEncoder()

  constructor(
    private readonly vfs: VirtualFileSystem,
    private readonly buffer: LogBuffer,
    private readonly logger: Logger,
  ) {}

  async open(now: number): Promise<string> {
    this.currentPath = posix.join(LOGS_DIR, `session-${sessionId(now)}.ndjson`)
    await this.vfs.write(this.currentPath, new Uint8Array(0))
    await this.prune()
    this.unsubscribe = this.buffer.subscribe((record) => {
      this.pending.push(record)
      this.scheduleFlush()
    })
    return this.currentPath
  }

  private scheduleFlush(): void {
    if (this.timer != null) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, FLUSH_MS)
  }

  private flush(): Promise<void> {
    if (this.pending.length === 0) return this.flushing
    const batch = this.pending
    this.pending = []
    const bytes = this.encoder.encode(`${batch.map((r) => JSON.stringify(r)).join('\n')}\n`)
    this.flushing = this.flushing
      .then(() => appendEntry(this.vfs, this.currentPath, bytes))
      .catch((error) => {
        this.logger.warn('Failed to persist logs', error)
        // Re-queue so the batch isn't lost on a transient failure.
        this.pending.unshift(...batch)
      })
    return this.flushing
  }

  private async prune(): Promise<void> {
    let entries: { kind: string; pathname: string }[]
    try {
      entries = await this.vfs.list(LOGS_DIR)
    } catch {
      // No logs dir yet (or backend can't list) — nothing to prune.
      return
    }
    const sessions = entries
      .filter((e) => e.kind === 'file' && SESSION_RE.test(e.pathname))
      .map((e) => e.pathname)
      .sort()
    for (const path of sessions.slice(0, Math.max(0, sessions.length - KEEP_SESSIONS))) {
      try {
        await this.vfs.delete(path)
      } catch (error) {
        this.logger.warn(`Failed to prune log file ${path}`, error)
      }
    }
  }

  async dispose(): Promise<void> {
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.timer != null) {
      clearTimeout(this.timer)
      this.timer = null
    }
    await this.flush()
  }
}
