<script setup lang="ts">
import { DiffView } from '@arxhub/plugin-diff/ui'
import { Button, IconButton, Row, ScrollArea, Strip } from '@arxhub/uikit/core'
import { type DocumentVersionsProps, useDocumentVersions, versionLabel } from './use-document-versions'

const props = defineProps<DocumentVersionsProps>()
const emit = defineEmits<{ close: [] }>()
const state = useDocumentVersions(props, () => emit('close'))
const { versions, selected, loading, reading, restoring, error, previewError, result, controller, blockStop, blockLabel, canRestore } = state

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !restoring.value) {
    event.stopPropagation()
    emit('close')
  }
}
</script>

<template>
  <div class="versions" role="region" aria-label="Saved versions" @keydown="onKeydown">
    <aside class="side">
      <Strip title="Saved versions" flush-actions>
        <template #actions>
          <IconButton size="lg" icon="lu:x" aria-label="Close versions" tooltip="Close versions" :disabled="restoring" @click="emit('close')" />
        </template>
      </Strip>
      <ScrollArea class="list">
        <nav aria-label="Saved document versions">
          <Row
            v-for="version in versions"
            :key="version.id"
            as="button"
            type="button"
            wrap
            :selected="selected?.id === version.id"
            :disabled="restoring"
            @click="selected = version"
          >
            {{ versionLabel(versions, version) }}
          </Row>
        </nav>
        <p v-if="store.limit">Up to {{ store.limit }} saved versions are kept per document.</p>
        <p v-if="!loading && !error && !versions.length">History starts when this document is saved.</p>
        <p v-if="loading" role="status">Loading versions…</p>
        <p v-if="reading" role="status">Loading version…</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="previewError" role="alert">{{ previewError }}</p>
        <p v-if="selected && mode === 'editable'">Your current draft will be saved before restoring this version.</p>
        <p v-else-if="selected">Switch to Editable to restore a version.</p>
      </ScrollArea>
      <div class="commands">
        <Button size="sm" variant="ghost" :disabled="restoring" @click="state.refresh">Refresh versions</Button>
        <Button size="sm" variant="secondary" :disabled="!blockStop || !canRestore" @click="state.restoreBlock">{{ blockLabel }}</Button>
        <Button size="sm" variant="secondary" :disabled="!canRestore" @click="state.restore()">{{ restoring ? 'Restoring…' : 'Restore this version' }}</Button>
      </div>
    </aside>
    <div class="main">
      <DiffView v-if="result" class="diff" :result="result" :controller="controller" :title="title" icon="lu:file-text" :open-document="() => emit('close')" />
    </div>
  </div>
</template>

<style scoped>
.versions { display: flex; flex: 1; min-height: 0; min-width: 0; background: var(--gray-1); }
.side { display: flex; flex: none; flex-direction: column; width: 240px; min-height: 0; border-right: 1px solid var(--gray-6); background: var(--gray-2); }
.list { flex: 1; }
.list p { margin: 8px 12px; font-size: var(--font-size-sm); color: var(--gray-11); }
.commands { display: flex; flex-direction: column; align-items: stretch; gap: 8px; padding: 12px; border-top: 1px solid var(--gray-6); }
.main { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; }
.diff { flex: 1; min-height: 0; }
</style>
