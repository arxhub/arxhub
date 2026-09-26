<script setup lang="ts">
import { GateLayout, ProgressBar, Row, StatusDot } from '@arxhub/uikit/core'
import { computed } from 'vue'
import type { BootEntry, BootLedger } from '../boot-ledger'
import { pluginLabel } from '../plugin-label'

const props = defineProps<{ ledger: BootLedger }>()

// The phase a plugin is in, said in words rather than as the method name — `configure()` is the boot's
// vocabulary, not the owner's. `start` is the only phase that takes real time, so it is the one worth
// naming plainly; the three before it pass in microseconds and are only ever seen already done.
const PHASE_LABEL: Record<string, string> = {
  setup: 'preparing',
  create: 'registering',
  configure: 'wiring',
  start: 'starting',
}

function stateText(entry: BootEntry): string {
  if (entry.state === 'off') return 'switched off'
  if (entry.state === 'ready') return 'ready'
  if (entry.state === 'failed') return `failed while ${PHASE_LABEL[entry.phase ?? ''] ?? entry.phase}`
  if (entry.state === 'running') return PHASE_LABEL[entry.phase ?? ''] ?? 'loading'
  return 'waiting'
}

function dotTone(entry: BootEntry): 'neutral' | 'accent' | 'success' | 'danger' {
  return entry.state === 'running' ? 'accent' : entry.state === 'ready' ? 'success' : entry.state === 'failed' ? 'danger' : 'neutral'
}

const percent = computed(() => (props.ledger.total === 0 ? 0 : Math.round((props.ledger.ready / props.ledger.total) * 100)))
</script>

<template>
  <!-- `status`, not `alertdialog` — nothing is wrong yet. -->
  <GateLayout class="boot" role="status" aria-live="polite" width="wide">
    <template #title>Starting ArxHub</template>
    <template #text>{{ ledger.ready }} of {{ ledger.total }} plugins ready</template>

    <!-- The bar is the summary; the list below is the detail. Both are needed: a bar alone cannot say
         WHICH plugin is holding everything up, which is the whole reason to look at this screen. -->
    <ProgressBar :value="percent" />

    <ul class="plugins">
      <Row v-for="entry in ledger.entries" :key="entry.name" as="li" plain :class="`plugin--${entry.state}`">
        <StatusDot :tone="dotTone(entry)" :pulse="entry.state === 'running'" />
        <!-- The Row centres the dot; the text shares one baseline, or the 12px columns ride above the name. -->
        <span class="text">
          <span class="name">{{ pluginLabel(entry.name) }}</span>
          <span class="version">{{ entry.version }}</span>
          <span class="state">{{ stateText(entry) }}</span>
        </span>
      </Row>
    </ul>
  </GateLayout>
</template>

<style scoped>
.plugins {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.name {
  color: var(--gray-12);
}

.version,
.state {
  color: var(--gray-11);
  font-size: var(--font-size-xs);
}

.version {
  font-family: var(--font-mono);
}

/* The state is the column the eye scans down, so it is the one pinned to the right edge. */
.state {
  margin-left: auto;
}

.plugin--off .name,
.plugin--off .version,
.plugin--waiting .name {
  color: var(--gray-9);
}

.plugin--failed .state {
  color: var(--danger-11);
}
</style>
