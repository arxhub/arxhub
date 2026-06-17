import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { SyncEngine } from '@arxhub/sync'
import { ref } from 'vue'

export type SyncStatus = 'idle' | 'syncing' | 'error'

export class SyncExtension extends Extension {
  readonly status = ref<SyncStatus>('idle')
  readonly lastSynced = ref<Date | null>(null)
  readonly lastError = ref<string | null>(null)
  engine: SyncEngine | null = null

  constructor(args: ExtensionArgs) {
    super(args)
  }

  async sync(): Promise<void> {
    if (!this.engine || this.status.value === 'syncing') return
    this.status.value = 'syncing'
    this.lastError.value = null
    try {
      await this.engine.sync()
      this.lastSynced.value = new Date()
      this.status.value = 'idle'
    } catch (error) {
      // Don't swallow: log for diagnostics and expose the message so the footer can surface it.
      this.logger.error('Sync failed', error)
      this.lastError.value = error instanceof Error ? error.message : String(error)
      this.status.value = 'error'
    }
  }
}
