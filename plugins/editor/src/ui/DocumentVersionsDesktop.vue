<script setup lang="ts">
import { DiffView } from '@arxhub/plugin-diff/ui'
import { Button, IconButton, Row, ScrollArea, Strip } from '@arxhub/uikit/core'
import { t } from '../i18n/messages'
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
  <div class="versions" role="region" :aria-label="t('tools.versions')" @keydown="onKeydown">
    <aside class="side">
      <Strip :title="t('tools.versions')" flush-actions>
        <template #actions>
          <IconButton size="lg" icon="lu:x" :aria-label="t('versions.close')" :tooltip="t('versions.close')" :disabled="restoring" @click="emit('close')" />
        </template>
      </Strip>
      <ScrollArea class="list">
        <nav :aria-label="t('versions.nav')">
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
        <p v-if="store.limit">{{ t('versions.limit', { limit: store.limit }) }}</p>
        <p v-if="!loading && !error && !versions.length">{{ t('versions.empty') }}</p>
        <p v-if="loading" role="status">{{ t('versions.loadingList') }}</p>
        <p v-if="reading" role="status">{{ t('versions.loadingOne') }}</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <p v-if="previewError" role="alert">{{ previewError }}</p>
        <p v-if="selected && mode === 'editable'">{{ t('versions.draftWillSave') }}</p>
        <p v-else-if="selected">{{ t('versions.switchToEditable') }}</p>
      </ScrollArea>
      <div class="commands">
        <Button size="sm" variant="ghost" :disabled="restoring" @click="state.refresh">{{ t('versions.refresh') }}</Button>
        <Button size="sm" variant="secondary" :disabled="!blockStop || !canRestore" @click="state.restoreBlock">{{ blockLabel }}</Button>
        <Button size="sm" variant="secondary" :disabled="!canRestore" @click="state.restore()">{{ restoring ? t('versions.restoring') : t('versions.restore') }}</Button>
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
