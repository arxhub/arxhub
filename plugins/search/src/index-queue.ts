import type { Logger } from '@arxhub/logger'
import type { Indexer } from '@arxhub/sql'
import type { VfsChange } from '@arxhub/vfs'

// How long after the last change the queue drains. Saving a note is not one write — an autosave fires
// again on the next keystroke — and reindexing each one would spend the whole budget re-reading the same
// file (FR-225).
export const DEFAULT_DEBOUNCE_MS = 400

export interface IndexQueueOptions {
  indexer: Indexer
  logger: Logger
  debounceMs?: number
}

export interface IndexQueue {
  // The drain in flight, if there is one. Something shutting down awaits this before closing the index
  // under it, the same way it awaits the walk.
  readonly running: Promise<void> | null
  // Settable, because it is a setting: the owner changes it in the settings section and the next write
  // has to use the new value. A timer already ticking keeps the delay it was armed with.
  debounceMs: number
  // Records a change. Nothing runs yet: the drain is scheduled `debounceMs` after the last change.
  push(change: VfsChange): void
  // Drains now, ignoring the debounce. Resolves when the queue is empty.
  flush(): Promise<void>
  // Stops accepting changes and drops the pending timer and paths.
  dispose(): void
}

export function createIndexQueue(options: IndexQueueOptions): IndexQueue {
  return new DebouncedIndexQueue(options)
}

// Keeps the index level with the content store one change at a time. The pending work is two SETS of
// paths, not a list of changes: a file written five times before the drain is read once, and what lands
// in the index is its last state — which is also why replaying every write in order would be wasted work.
class DebouncedIndexQueue implements IndexQueue {
  private readonly indexer: Indexer
  private readonly logger: Logger
  debounceMs: number
  private readonly toIndex = new Set<string>()
  private readonly toRemove = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private draining: Promise<void> | null = null
  private disposed = false

  constructor({ indexer, logger, debounceMs = DEFAULT_DEBOUNCE_MS }: IndexQueueOptions) {
    this.indexer = indexer
    this.logger = logger
    this.debounceMs = debounceMs
  }

  get running(): Promise<void> | null {
    return this.draining
  }

  push(change: VfsChange): void {
    if (this.disposed) return

    switch (change.kind) {
      case 'written':
        this.stage(change.pathname)
        break
      case 'deleted':
        this.unstage(change.pathname)
        break
      case 'renamed':
        // The old path leaves the index and the new one enters it — one change, two pieces of work.
        if (change.from != null) this.unstage(change.from)
        this.stage(change.pathname)
        break
    }

    this.schedule()
  }

  async flush(): Promise<void> {
    this.clearTimer()
    await this.drain()
  }

  dispose(): void {
    this.disposed = true
    this.clearTimer()
    this.toIndex.clear()
    this.toRemove.clear()
  }

  // The last change on a path decides which side it lands on: a file written again after being deleted
  // exists, and a file deleted after being written does not.
  private stage(pathname: string): void {
    this.toRemove.delete(pathname)
    this.toIndex.add(pathname)
  }

  private unstage(pathname: string): void {
    this.toIndex.delete(pathname)
    this.toRemove.add(pathname)
  }

  private clearTimer(): void {
    if (this.timer == null) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private schedule(): void {
    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      void this.drain()
    }, this.debounceMs)
  }

  private drain(): Promise<void> {
    // One drain at a time. A change that arrives while it runs is picked up by the loop below or by the
    // next timer — never by a second pass racing this one over the same path.
    if (this.draining != null) return this.draining
    const running = this.run().finally(() => {
      this.draining = null
    })
    this.draining = running
    return running
  }

  // Nothing here waits for the walk: catch-up and observation run at the same time, and a path the walk
  // is about to reach only gets read twice, which is idempotent. Waiting would be worse — a first boot's
  // walk takes minutes, and a note saved during it must be findable now.
  private async run(): Promise<void> {
    while (this.toRemove.size > 0 || this.toIndex.size > 0) {
      // Removals first: a rename queues both, and dropping the old row before writing the new one keeps
      // the index from briefly holding the same document twice.
      for (const pathname of take(this.toRemove)) {
        try {
          await this.indexer.removePath(pathname)
        } catch (error) {
          this.logger.warn({ path: pathname, err: error }, 'Could not drop a path from the index — the rest of the queue still runs')
        }
      }
      for (const pathname of take(this.toIndex)) {
        try {
          await this.indexer.indexPath(pathname)
        } catch (error) {
          this.logger.warn({ path: pathname, err: error }, 'Could not reindex a path — the rest of the queue still runs')
        }
      }
    }
  }
}

// Empties the set and hands back what was in it, so a change arriving mid-drain is queued for the next
// pass instead of mutating the collection being iterated.
function take(paths: Set<string>): string[] {
  const taken = Array.from(paths)
  paths.clear()
  return taken
}
