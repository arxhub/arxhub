<script setup lang="ts">
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { Button, IconButton } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { SyncExtension } from '../sync-extension'

const arxhub = useArxHub()
const sync = arxhub.extensions.get(SyncExtension)
const shell = arxhub.extensions.get(ShellExtension)
const settings = arxhub.extensions.get(SettingsExtension)

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
  settings.open('sync')
  shell.sidebar.setActive('arxhub.settings')
}
</script>

<template>
  <div class="sync-footer">
    <IconButton icon="lu:settings" tooltip="Sync settings" @click="openSettings" />
    <span class="status" :class="`status--${sync.status.value}`">
      <span class="dot" />
      {{ statusLabel }}
    </span>
    <Button
      variant="secondary"
      size="sm"
      :disabled="sync.status.value === 'syncing' || !sync.engine"
      @click="sync.sync()"
    >
      Sync
    </Button>
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
