<script setup lang="ts">
import { StatusDot } from '@arxhub/uikit/core'
import { toaster, useArxHub, useShellFrame } from '@arxhub/uikit/hooks'
import { computed, onUnmounted, ref, watch } from 'vue'
import { SyncExtension } from '../sync-extension'

const arxhub = useArxHub()
const sync = arxhub.extensions.get(SyncExtension)
const touch = useShellFrame() === 'mobile'

// The only place a conflict copy becomes visible without browsing the vault for a file that quietly
// appeared. One toast per round, naming every copy this round wrote — merge() resolves conflicts
// automatically and without asking, so this is the announcement, not a confirmation dialog.
watch(sync.lastConflicts, (conflicts) => {
  if (conflicts.length === 0) return
  toaster.create({
    title: conflicts.length === 1 ? 'A sync conflict was resolved' : `${conflicts.length} sync conflicts were resolved`,
    description:
      conflicts.length === 1
        ? `Your version was kept; the other device's edit is at "${conflicts[0]}".`
        : `Your versions were kept; the other device's edits are in: ${conflicts.join(', ')}.`,
    type: 'warning',
  })
})

// A content merger (ArxEditor's, for `.arx`) absorbed the overlap INTO the file instead of writing a
// copy beside it — there is nothing to browse to by accident here, so this is the only announcement
// there is. One toast per file, each naming the file, so the user can open exactly the one that needs
// a decision rather than searching the vault for it.
watch(sync.lastUnresolved, (unresolved) => {
  for (const { pathname, count } of unresolved) {
    toaster.create({
      title: `${count} conflict${count === 1 ? '' : 's'} in "${pathname}"`,
      description: 'Open it to resolve.',
      type: 'warning',
    })
  }
})

// The edit always wins over a delete — there is no document left on the deleting side to hold a
// decision in — but it IS a decision made for the user, so it gets its own announcement rather than
// passing for an ordinary, silent no-op merge.
watch(sync.lastDecisions, (decisions) => {
  for (const { pathname, kind } of decisions) {
    if (kind !== 'edit-over-delete') continue
    toaster.create({ title: `Edit kept over a deletion: ${pathname}`, type: 'warning' })
  }
})

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

// Never-synced is a nudge, not a failure: amber, the same tone an unsaved file uses.
const dotTone = computed(() => {
  switch (state.value) {
    case 'syncing':
      return 'accent'
    case 'error':
      return 'danger'
    case 'synced':
      return 'success'
    default:
      return 'warning'
  }
})
</script>

<template>
  <div class="sync-status" :class="{ touch }" role="status" :aria-label="statusLabel">
    <StatusDot :tone="dotTone" :pulse="syncing" />
    {{ statusLabel }}
  </div>
</template>

<style scoped>
.sync-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: var(--size-md);
  padding: 0 8px;
  border-radius: var(--radius-xs);
  font-family: var(--font-sans);
  font-size: var(--font-size-xs);
  color: var(--gray-11);
  white-space: nowrap;
}

.sync-status.touch {
  height: var(--size-xl);
  font-size: var(--font-size-sm);
}
</style>
