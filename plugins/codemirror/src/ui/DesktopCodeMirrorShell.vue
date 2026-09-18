<script setup lang="ts">
import { DocumentName } from '@arxhub/plugin-notes/ui'
import { Button, Strip } from '@arxhub/uikit/core'
import type { EditorView } from '@codemirror/view'
import MarkdownToolbar from './MarkdownToolbar.vue'

defineProps<{
  path: string
  view: EditorView | null
  revision: number
  note: boolean
  canSave: boolean
  loadError: unknown
  onSave: () => void
  onRetry: () => void
}>()
</script>

<template>
  <div class="codemirror-wrapper" @keydown.ctrl.s.prevent.stop="onSave()" @keydown.meta.s.prevent.stop="onSave()">
    <Strip>
      <DocumentName :path="path" />
      <MarkdownToolbar v-if="note && !loadError" :view="view" :revision="revision" />
      <template #actions>
        <Button variant="secondary" :disabled="!canSave" @click="onSave()">Save</Button>
      </template>
    </Strip>
    <div v-if="loadError" class="codemirror-error">
      <span>Couldn't load this file. Saving is disabled to avoid overwriting it.</span>
      <Button size="sm" variant="secondary" @click="onRetry()">Retry</Button>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.codemirror-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.codemirror-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  font-size: var(--font-size-xs);
  color: var(--danger-11);
  background: var(--danger-2);
  border-bottom: 1px solid var(--danger-6);
}
</style>
