<script setup lang="ts">
import { ShellExtension } from '@arxhub/plugin-shell/ui'
import { useArxHub } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
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
  if (counts.value.error > 0) return 'error'
  if (counts.value.warn > 0) return 'warn'
  return 'clean'
})

// Keep the bar narrow: counts past 999 add no signal, only width.
function fmt(n: number): string {
  return n > 999 ? '999+' : String(n)
}

function openLogs(): void {
  // Focus the Logs sidebar mini-app (idempotent — never opens a duplicate).
  shell.sidebar.setActive('arxhub.logs')
}
</script>

<template>
  <button type="button" class="fx-item" aria-label="Open logs" title="Open logs" @click="openLogs">
    <span class="dot" :class="`dot--${tone}`" />
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
  height: 100%;
  padding: 0 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--gray-11);
  white-space: nowrap;
  transition: color var(--duration-normal), background-color var(--duration-normal);
}

.fx-item:hover {
  background-color: var(--gray-3);
  color: var(--gray-12);
}

.fx-item:focus-visible {
  outline: 2px solid var(--accent-9);
  outline-offset: -2px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--gray-8);
  flex-shrink: 0;
}

.dot--warn { background: var(--warning-9); }
.dot--error { background: var(--red-9); }

.count {
  font-weight: var(--font-weight-bold);
}

.count--warn { color: var(--warning-11); }
.count--error { color: var(--red-11); }
</style>
