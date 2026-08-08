import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { SyncEngine } from '@arxhub/sync'
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

  constructor(args: ExtensionArgs) {
    super(args)
  }

  async sync(): Promise<void> {
    if (!this.engine || this.status.value === 'syncing') return
    this.status.value = 'syncing'
    this.lastError.value = null
    this.lastConflicts.value = []
    try {
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
