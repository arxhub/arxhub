import type { Logger } from '@arxhub/logger'
import type { Indexer, IndexerOptions, IndexerStatus } from '@arxhub/sql'

// Only the two calls the queue makes are real. The walk is not involved on purpose: a change arriving
// while a walk runs has to be handled exactly like one arriving while nothing does.
export class FakeIndexer implements Indexer {
  readonly status: IndexerStatus = {
    state: 'idle',
    processed: 0,
    documentCount: 0,
    lastScanStartedAt: null,
    lastScanFinishedAt: null,
  }
  readonly running: Promise<unknown> | null = null
  readonly indexed: string[] = []
  readonly removed: string[] = []
  readonly configured: IndexerOptions[] = []
  // Paths whose reindex rejects, so a failure on one path can be watched not to take the others with it.
  failOn = new Set<string>()

  subscribe(): () => void {
    return () => undefined
  }

  async scan(): Promise<IndexerStatus> {
    return this.status
  }

  async reindex(): Promise<IndexerStatus> {
    return this.status
  }

  async indexPath(pathname: string): Promise<void> {
    if (this.failOn.has(pathname)) throw new Error(`cannot read ${pathname}`)
    this.indexed.push(pathname)
  }

  async removePath(pathname: string): Promise<void> {
    this.removed.push(pathname)
  }

  cancel(): void {}

  configure(options: IndexerOptions): void {
    this.configured.push(options)
  }
}

export function silentLogger(): Logger {
  const logger: Logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => logger,
  }
  return logger
}
