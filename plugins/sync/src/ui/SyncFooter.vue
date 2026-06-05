<script setup lang="ts">
import { PanelStoreExtension } from '@arxhub/plugin-panels/ui'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { SyncExtension } from '../sync-extension'

const arxhub = useArxHub()
const sync = arxhub.extensions.get(SyncExtension)
const { store } = arxhub.extensions.get(PanelStoreExtension)

const statusLabel = computed(() => {
  if (sync.status.value === 'syncing') return 'Syncing…'
  if (sync.status.value === 'error') return 'Sync error'
  if (sync.lastSynced.value) {
    const diff = Math.round((Date.now() - sync.lastSynced.value.getTime()) / 1000)
    if (diff < 60) return `Synced ${diff}s ago`
    return `Synced ${Math.round(diff / 60)}m ago`
  }
  return 'Not synced'
})

function openSettings() {
  store.openPanel('arxhub.sync.settings')
}
</script>

<template>
  <div class="sync-footer">
    <button class="gear-btn" title="Sync settings" @click="openSettings">⚙</button>
    <span class="status" :class="`status--${sync.status.value}`">
      <span class="dot" />
      {{ statusLabel }}
    </span>
    <button
      class="sync-btn"
      :disabled="sync.status.value === 'syncing' || !sync.engine"
      @click="sync.sync()"
    >
      Sync
    </button>
  </div>
</template>

<style scoped>
.sync-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  height: 100%;
}

.gear-btn,
.sync-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--gray-11);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.gear-btn:hover,
.sync-btn:hover:not(:disabled) {
  background: var(--gray-4);
  color: var(--gray-12);
}

.sync-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  font-family: var(--font-sans);
  color: var(--gray-10);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--gray-8);
}

.status--syncing .dot {
  background: var(--accent-9);
  animation: pulse 1s infinite;
}

.status--error .dot {
  background: var(--red-9);
}

.status--idle .dot {
  background: var(--green-9);
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
