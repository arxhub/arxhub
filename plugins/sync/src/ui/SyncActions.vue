<script setup lang="ts">
import { SETTINGS_TYPE_ID, SettingsExtension } from '@arxhub/plugin-settings'
import { ShellExtension } from '@arxhub/plugin-shell'
import { Icon } from '@arxhub/uikit/core'
import { useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { t } from '../i18n/messages'
import { SyncExtension } from '../sync-extension'

const arxhub = useArxHub()
const sync = arxhub.extensions.get(SyncExtension)
const shell = arxhub.extensions.get(ShellExtension)
const settings = arxhub.extensions.get(SettingsExtension)
// The desktop bar is 40px tall; the phone's status card in the search sheet is not, so the same
// controls can take the touch row height there without colliding with the bar's ceiling.
const touch = useShellFrame() === 'mobile'

const syncing = computed(() => sync.status.value === 'syncing')

function openSettings(): void {
  settings.open('sync')
  shell.workspace.activateType(SETTINGS_TYPE_ID)
}
</script>

<template>
  <div class="sync-actions" :class="{ touch }">
    <button
      type="button"
      class="fx-item"
      :aria-label="t('actions.syncNow')"
      :title="t('actions.syncNow')"
      :disabled="syncing || !sync.engine"
      @click="sync.sync({ full: true })"
    >
      <Icon name="lu:refresh-cw" :size="touch ? 16 : 14" :class="{ spin: syncing }" />
      <!-- The phone's status block is one line beside the states, and the approved mock puts sync there as an
           icon alone; the aria-label names it either way. -->
      <template v-if="!touch">{{ t('actions.sync') }}</template>
    </button>
    <button type="button" class="fx-item" :aria-label="t('actions.settings')" :title="t('actions.settings')" @click="openSettings">
      <Icon name="lu:settings" :size="touch ? 16 : 14" />
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
  justify-content: center;
  gap: 8px;
  min-width: var(--size-md);
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

.sync-actions.touch .fx-item {
  min-width: var(--size-xl);
  height: var(--size-xl);
  padding: 0 12px;
  font-size: var(--font-size-sm);
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
