import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { FileHistory, SyncEngine } from '@arxhub/sync'
import { ref } from 'vue'

export type SyncStatus = 'idle' | 'syncing' | 'error'

export class SyncExtension extends Extension {
  readonly status = ref<SyncStatus>('idle')
  readonly lastSynced = ref<Date | null>(null)
  readonly lastError = ref<string | null>(null)
  // Conflict copies the MOST RECENT sync round wrote (vault paths, cleared at the start of the next
  // round) — the only way today a user learns a conflict exists at all short of stumbling on a
  // `conflict-*` file while browsing. Not cumulative across rounds: a UI reacting to it (a toast) is
  // meant to fire once per round, not re-announce an older conflict the user already saw.
  readonly lastConflicts = ref<string[]>([])
  engine: SyncEngine | null = null
  history: FileHistory | null = null

  constructor(args: ExtensionArgs) {
    super(args)
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
    try {
      if (options.full === true) await this.engine.add('vault')
      await this.engine.add('storage')
      const result = await this.engine.sync()
      this.lastSynced.value = new Date()
      this.lastConflicts.value = result.conflicts
      this.status.value = 'idle'
    } catch (error) {
      // Don't swallow: log for diagnostics and expose the message so the footer can surface it.
      this.logger.error('Sync failed', error)
      this.lastError.value = error instanceof Error ? error.message : String(error)
      this.status.value = 'error'
    }
  }
}
