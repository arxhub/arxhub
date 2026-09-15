import { Extension, type ExtensionArgs } from '@arxhub/core'
import { illegalState } from '@arxhub/errors'
import type { RepositoryExtension } from '@arxhub/plugin-repository/ui'
import type { SyncEngine } from '@arxhub/sync'
import { ref } from 'vue'

export type SyncStatus = 'idle' | 'syncing' | 'error'

export interface SyncExtensionArgs extends ExtensionArgs {
  // The local half of the same object — Sync is the remote exchange layered over it (A-50). Fixed at
  // construction: Repository is essential, so it outlives Sync for the whole of this plugin's life.
  repository: RepositoryExtension
}

export class SyncExtension extends Extension {
  readonly status = ref<SyncStatus>('idle')
  readonly lastSynced = ref<Date | null>(null)
  readonly lastError = ref<string | null>(null)
  // Conflict copies the MOST RECENT sync round wrote (vault paths, cleared at the start of the next
  // round) — the only way today a user learns a conflict exists at all short of stumbling on a
  // `conflict-*` file while browsing. Not cumulative across rounds: a UI reacting to it (a toast) is
  // meant to fire once per round, not re-announce an older conflict the user already saw.
  readonly lastConflicts = ref<string[]>([])
  // Same "most recent round only" shape, for the two other things a merge can report: a path a content
  // merger absorbed conflicts into (still unresolved INSIDE the file, e.g. a `.arx` conflict block —
  // see `arx-merge.ts`) rather than writing a copy beside it, and a path where an edit won over a
  // delete because there was no document left on the other side to hold a decision in.
  readonly lastUnresolved = ref<{ pathname: string; count: number }[]>([])
  readonly lastDecisions = ref<{ pathname: string; kind: 'edit-over-delete' }[]>([])
  engine: SyncEngine | null = null

  private readonly repository: RepositoryExtension

  constructor(args: SyncExtensionArgs) {
    super(args)
    this.repository = args.repository
  }

  // Bring a file this device left in the cloud onto disk. `path` in the repo's coordinates (vault/…).
  async materialize(path: string): Promise<void> {
    if (!this.engine) throw illegalState('Connect to the sync server to download this file.')
    await this.engine.materialize(path)
    // Materializing may have resolved a pending path the repository is tracking.
    await this.repository.refreshPending()
  }

  // A slice of a file left in the cloud, without materialising it. `path` in the repo's coordinates
  // (vault/…) — same convention as materialize above.
  async readRange(path: string, offset: number, length?: number): Promise<Uint8Array> {
    if (!this.engine) throw illegalState('Connect to the sync server to read this file.')
    return this.engine.readRange(path, offset, length)
  }

  // A round looks at what the journal names — every vault write the watcher saw since the last one —
  // plus the whole of storage/, which nothing observes (config saves go through an unwrapped view and
  // the tree is a handful of files). `full` adds the whole vault: the first round of a session and a
  // manual "Sync now", because an edit made while the app was not running reached no watcher, and a
  // stat-walk is what finds it. It costs one head() per file and no reads, which is why it is not
  // every round: on a phone, thirty seconds is not long enough to justify statting the whole vault.
  async sync(options: { full?: boolean } = {}): Promise<void> {
    if (!this.engine || this.status.value === 'syncing') return
    this.status.value = 'syncing'
    this.lastError.value = null
    this.lastConflicts.value = []
    this.lastUnresolved.value = []
    this.lastDecisions.value = []
    try {
      if (options.full === true) await this.engine.add('vault')
      await this.engine.add('storage')
      const result = await this.engine.sync()
      this.lastSynced.value = new Date()
      this.lastConflicts.value = result.conflicts
      this.lastUnresolved.value = result.unresolved
      this.lastDecisions.value = result.decisions
      this.status.value = 'idle'
    } catch (error) {
      // Don't swallow: log for diagnostics and expose the message so the footer can surface it.
      this.logger.error('Sync failed', error)
      this.lastError.value = error instanceof Error ? error.message : String(error)
      this.status.value = 'error'
    } finally {
      // Either outcome may have changed what is pending — a round that failed partway can still have
      // merged a head that left new files in the cloud.
      await this.repository.refreshPending()
    }
  }
}
