import { Extension, type ExtensionArgs } from '@arxhub/core'
import type { SyncEngine } from '@arxhub/sync'
import { ref } from 'vue'

export type SyncStatus = 'idle' | 'syncing' | 'error'

export class SyncExtension extends Extension {
  readonly status = ref<SyncStatus>('idle')
  readonly lastSynced = ref<Date | null>(null)
  engine: SyncEngine | null = null

  constructor(args: ExtensionArgs) {
    super(args)
  }

  async sync(): Promise<void> {
    if (!this.engine || this.status.value === 'syncing') return
    this.status.value = 'syncing'
    try {
      await this.engine.sync()
      this.lastSynced.value = new Date()
      this.status.value = 'idle'
    } catch {
      this.status.value = 'error'
    }
  }
}
