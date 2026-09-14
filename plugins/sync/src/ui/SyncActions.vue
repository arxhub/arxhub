<script setup lang="ts">
import { SETTINGS_TYPE_ID, SettingsExtension } from '@arxhub/plugin-settings/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { Icon } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { SyncExtension } from '../sync-extension'

const arxhub = useArxHub()
const sync = arxhub.extensions.get(SyncExtension)
const shell = arxhub.extensions.get(ShellExtension)
const settings = arxhub.extensions.get(SettingsExtension)

const syncing = computed(() => sync.status.value === 'syncing')

function openSettings(): void {
  settings.open('sync')
  shell.workspace.activateType(SETTINGS_TYPE_ID)
}
</script>

<template>
  <div class="sync-actions">
    <button
      type="button"
      class="fx-item"
      aria-label="Sync now"
      title="Sync now"
      :disabled="syncing || !sync.engine"
      @click="sync.sync({ full: true })"
    >
      <Icon name="lu:refresh-cw" :size="14" :class="{ spin: syncing }" />
      Sync
    </button>
    <button type="button" class="fx-item" aria-label="Sync settings" title="Sync settings" @click="openSettings">
      <Icon name="lu:settings" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.sync-actions {
  display: flex;
  align-items: stretch;
  height: 100%;
}

.fx-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: var(--size-md);
  padding: 0 8px;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--gray-11);
  white-space: nowrap;
  transition: color var(--duration-fast), background-color var(--duration-fast);
}

.fx-item:hover:not(:disabled) {
  background-color: var(--gray-4);
  color: var(--gray-12);
}

.fx-item:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.fx-item:disabled {
  cursor: not-allowed;
  background: var(--gray-3);
  color: var(--gray-9);
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .spin { animation: none; }
}
</style>
