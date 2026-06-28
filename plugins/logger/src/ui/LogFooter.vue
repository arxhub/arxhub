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

function openLogs(): void {
  // Focus the Logs sidebar mini-app (idempotent — never opens a duplicate).
  shell.sidebar.setActive('arxhub.logs')
}
</script>

<template>
  <button type="button" class="log-footer" title="Open logs" @click="openLogs">
    <span class="dot" :class="{ alert: counts.error > 0 || counts.warn > 0 }" />
    <span class="label">Logs</span>
    <span v-if="counts.warn > 0" class="count warn">{{ counts.warn }}</span>
    <span v-if="counts.error > 0" class="count error">{{ counts.error }}</span>
  </button>
</template>

<style scoped>
.log-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 100%;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: var(--font-size-xs);
  font-family: var(--font-sans);
  color: var(--gray-10);
}

.log-footer:hover {
  color: var(--gray-12);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--gray-8);
}

.dot.alert {
  background: var(--warning-9);
}

.count {
  font-weight: var(--font-weight-bold);
}

.count.warn { color: var(--warning-11); }
.count.error { color: var(--red-11); }
</style>
