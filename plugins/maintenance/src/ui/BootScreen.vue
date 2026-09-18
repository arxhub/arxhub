<script setup lang="ts">
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

const percent = computed(() => (props.ledger.total === 0 ? 0 : Math.round((props.ledger.ready / props.ledger.total) * 100)))
</script>

<template>
  <!-- Deliberately not <main>, for the same reason the crash screen is not: the app's own main landmark
       is what says the app itself came up, and a screen standing in front of it must not answer to that.
       `status`, not `alertdialog` — nothing is wrong yet. -->
  <div class="boot" role="status" aria-live="polite" aria-labelledby="boot-title">
    <div class="card">
      <header class="head">
        <h1 id="boot-title" class="title">Starting ArxHub</h1>
        <p class="lede">{{ ledger.ready }} of {{ ledger.total }} plugins ready</p>
      </header>

      <!-- The bar is the summary; the list below is the detail. Both are needed: a bar alone cannot say
           WHICH plugin is holding everything up, which is the whole reason to look at this screen. -->
      <div class="track" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
        <div class="fill" :style="{ width: `${percent}%` }" />
      </div>

      <ul class="plugins">
        <li v-for="entry in ledger.entries" :key="entry.name" class="plugin" :class="`plugin--${entry.state}`">
          <span class="dot" />
          <span class="name">{{ pluginLabel(entry.name) }}</span>
          <span class="version">{{ entry.version }}</span>
          <span class="state">{{ stateText(entry) }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
/* Self-sufficient by design, exactly like the crash screen beside it: this screen renders before the app
   has, so it leans on nothing but the design tokens — and falls back when even those have not loaded. No
   uikit import for the same reason that screen documents: `@arxhub/uikit/core` has no per-component
   export, so one control would drag in the whole entry (the lucide set registered as an import side
   effect included) on the surface whose job is to still work when something else did not. */
.boot {
  position: fixed;
  inset: 0;
  z-index: 9999;
  overflow: auto;
  padding: 32px 16px;
  background: var(--gray-1, #fff);
  font-family: var(--font-sans, system-ui, sans-serif);
  color: var(--gray-12, #111);
}

.card {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  max-width: 512px;
  margin: 0 auto;
}

.head {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.title {
  margin: 0;
  font-size: var(--font-size-xl, 1.25rem);
  font-weight: 600;
}

.lede {
  margin: 0;
  color: var(--gray-11, #555);
  font-size: var(--font-size-sm, 0.875rem);
}

.track {
  height: 4px;
  overflow: hidden;
  background: var(--gray-4, #e6e6e6);
  border-radius: var(--radius-full, 9999px);
}

.fill {
  height: 100%;
  background: var(--accent-9, #00a2c7);
  border-radius: var(--radius-full, 9999px);
  transition: width 120ms linear;
}

/* A boot is a few hundred milliseconds; an eased bar would still be catching up when the app is already
   on screen, and a reader would see it stop short of the end for no reason. */
@media (prefers-reduced-motion: reduce) {
  .fill {
    transition: none;
  }
}

.plugins {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.plugin {
  display: flex;
  gap: 8px;
  align-items: center;
  height: var(--size-2xs, 28px);
  font-size: var(--font-size-sm, 0.875rem);
}

.dot {
  flex: none;
  width: 6px;
  height: 6px;
  background: var(--gray-6, #ccc);
  border-radius: var(--radius-full, 9999px);
}

.plugin--running .dot {
  background: var(--accent-9, #00a2c7);
}

.plugin--ready .dot {
  background: var(--green-9, #30a46c);
}

.plugin--failed .dot {
  background: var(--red-9, #e5484d);
}

.name {
  color: var(--gray-12, #111);
}

.version,
.state {
  color: var(--gray-11, #555);
  font-size: var(--font-size-xs, 0.75rem);
}

.version {
  font-family: var(--font-mono, ui-monospace, monospace);
}

/* The state is the column the eye scans down, so it is the one pinned to the right edge. */
.state {
  margin-left: auto;
}

.plugin--off .name,
.plugin--off .version,
.plugin--waiting .name {
  color: var(--gray-9, #8f8f8f);
}

.plugin--failed .state {
  color: var(--red-11, #cd2b31);
}
</style>
