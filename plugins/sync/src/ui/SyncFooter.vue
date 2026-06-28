<script setup lang="ts">
import { SettingsExtension } from '@arxhub/plugin-settings/ui'
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { Icon } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed, onUnmounted, ref } from 'vue'
import { SyncExtension } from '../sync-extension'

const arxhub = useArxHub()
const sync = arxhub.extensions.get(SyncExtension)
const shell = arxhub.extensions.get(ShellExtension)
const settings = arxhub.extensions.get(SettingsExtension)

// Tick so relative "synced Ns ago" advances on its own instead of freezing at render time.
const now = ref(Date.now())
const timer = setInterval(() => {
  now.value = Date.now()
}, 1000)
onUnmounted(() => clearInterval(timer))

// idle splits into never-synced vs synced — the engine status alone can't tell them apart.
const state = computed<'never' | 'synced' | 'syncing' | 'error'>(() => {
  if (sync.status.value === 'syncing') return 'syncing'
  if (sync.status.value === 'error') return 'error'
  return sync.lastSynced.value ? 'synced' : 'never'
})

function relative(from: Date): string {
  const s = Math.max(0, Math.round((now.value - from.getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.round(m / 60)}h ago`
}

const statusLabel = computed(() => {
  switch (state.value) {
    case 'syncing':
      return 'Syncing…'
    case 'error':
      return 'Sync failed'
    case 'synced':
      return `Synced ${relative(sync.lastSynced.value as Date)}`
    default:
      return 'Not synced'
  }
})

const syncing = computed(() => state.value === 'syncing')

function openSettings() {
  settings.open('sync')
  shell.sidebar.setActive('arxhub.settings')
}
</script>

<template>
  <div class="sync-footer">
    <div class="fx-status" role="status" :aria-label="statusLabel">
      <span class="dot" :class="`dot--${state}`" />
      {{ statusLabel }}
    </div>
    <button
      type="button"
      class="fx-item"
      aria-label="Sync now"
      title="Sync now"
      :disabled="syncing || !sync.engine"
      @click="sync.sync()"
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
.sync-footer {
  display: flex;
  align-items: stretch;
  height: 100%;
}

.fx-status,
.fx-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  padding: 0 8px;
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--gray-11);
  white-space: nowrap;
}

.fx-item {
  background: transparent;
  border: none;
  cursor: pointer;
  transition: color var(--duration-normal), background-color var(--duration-normal);
}

.fx-item:hover:not(:disabled) {
  background-color: var(--gray-3);
  color: var(--gray-12);
}

.fx-item:focus-visible {
  outline: 2px solid var(--accent-9);
  outline-offset: -2px;
}

.fx-item:disabled {
  cursor: default;
  opacity: 0.6;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--gray-8);
  flex-shrink: 0;
}

.dot--synced { background: var(--green-9); }
.dot--error { background: var(--red-9); }
.dot--syncing {
  background: var(--accent-9);
  animation: pulse 1s infinite;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .dot--syncing { animation: none; }
  .spin { animation: none; }
}
</style>
