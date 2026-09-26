<script setup lang="ts">
import { DiffBand, DiffView } from '@arxhub/plugin-diff/ui'
import type { ActionItem } from '@arxhub/uikit/core'
import { useBackStack } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { type DocumentVersionsProps, useDocumentVersions } from './use-document-versions'

const props = defineProps<DocumentVersionsProps>()
const emit = defineEmits<{ close: [] }>()
const state = useDocumentVersions(props, () => emit('close'))
const { versions, selected, loading, reading, restoring, error, previewError, result, controller, parts, blockStop, blockLabel, canRestore } =
  state

// The page is a layer over the document: back returns to it.
useBackStack(
  () => true,
  () => emit('close'),
)

const actions = computed((): ActionItem[] => [
  {
    id: 'versions.restore',
    label: restoring.value ? 'Restoring…' : 'Restore this version',
    icon: 'lu:history',
    disabled: !canRestore.value,
    onSelect: () => void state.restore(),
  },
  {
    id: 'versions.block',
    label: blockLabel.value,
    icon: 'lu:undo-2',
    disabled: !blockStop.value || !canRestore.value,
    onSelect: () => void state.restoreBlock(),
  },
  { id: 'versions.refresh', label: 'Refresh versions', icon: 'lu:refresh-cw', disabled: restoring.value, onSelect: state.refresh },
])
</script>

<template>
  <div class="versions" role="region" aria-label="Saved versions">
    <div class="notes">
      <p v-if="loading" role="status">Loading versions…</p>
      <p v-if="reading" role="status">Loading version…</p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="previewError" role="alert">{{ previewError }}</p>
      <p v-if="!loading && !error && !versions.length">History starts when this document is saved.</p>
    </div>
    <DiffView v-if="result" class="diff" :result="result" :controller="controller" :title="title" icon="lu:file-text" :open-document="() => emit('close')" />
    <!-- A band of its own, not the editor's status chrome: that one pads and wraps, and the band's keys are
         written to fill a flush 48px dock edge to edge. -->
    <div class="band">
      <DiffBand
        :controller="controller"
        :title="title"
        icon="lu:file-text"
        :parts="parts"
        parts-title="Saved versions"
        :active-part="selected?.id"
        :actions="actions"
        :open-document="() => emit('close')"
        @update:active-part="state.select"
      />
    </div>
  </div>
</template>

<style scoped>
.versions { display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; background: var(--gray-1); }
.notes:empty { display: none; }
.notes p { margin: 8px 16px; font-size: var(--font-size-sm); color: var(--gray-11); }
.diff { flex: 1; min-height: 0; }
/* The hairline is a shadow, as in the shell's dock: a border would take a pixel off the 48px keys. */
.band { display: flex; flex-shrink: 0; align-items: stretch; height: var(--size-xl); box-shadow: inset 0 1px 0 var(--gray-6); background: var(--gray-2); }
</style>
