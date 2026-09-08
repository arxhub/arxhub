<script setup lang="ts">
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { StatusDot } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { LOGS_TYPE_ID } from '../contributions'
import { LoggerExtension } from '../logger-extension'

const arxhub = useArxHub()
const logger = arxhub.extensions.get(LoggerExtension)
const shell = arxhub.extensions.get(ShellExtension)

const counts = computed(() => {
  let warn = 0
  let error = 0
  for (const r of logger.records.value) {
    if (r.level >= 50) error++
    else if (r.level >= 40) warn++
  }
  return { warn, error }
})

// Error outranks warning — the dot reflects the most severe level present.
const tone = computed(() => {
  if (counts.value.error > 0) return 'danger'
  if (counts.value.warn > 0) return 'warning'
  return 'neutral'
})

// Keep the bar narrow: counts past 999 add no signal, only width.
function fmt(n: number): string {
  return n > 999 ? '999+' : String(n)
}

function openLogs(): void {
  // Entering a type IS opening it, and the workspace de-duplicates: an unpinned type takes its place in
  // the row on the way there, and a second press only switches to what is already open.
  shell.workspace.activateType(LOGS_TYPE_ID)
}
</script>

<template>
  <button type="button" class="fx-item" aria-label="Open logs" title="Open logs" @click="openLogs">
    <StatusDot :tone="tone" />
    <span>Logs</span>
    <span v-if="counts.warn > 0" class="count count--warn">{{ fmt(counts.warn) }}</span>
    <span v-if="counts.error > 0" class="count count--error">{{ fmt(counts.error) }}</span>
  </button>
</template>

<style scoped>
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

.fx-item:hover {
  background-color: var(--gray-4);
  color: var(--gray-12);
}

.fx-item:focus-visible {
  outline: 2px solid var(--accent-8);
  outline-offset: -1px;
}

.count {
  font-weight: var(--font-weight-medium);
}

.count--warn { color: var(--warning-11); }
.count--error { color: var(--danger-11); }
</style>
