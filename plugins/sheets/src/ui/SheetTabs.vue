<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { actionMenu, Button, IconButton, ScrollArea, Segmented, Strip } from '@arxhub/uikit/core'
import { computed } from 'vue'
import { worksheetActions } from './sheet-actions'
import { useSheet } from './use-sheet'

const session = useSheet()
const { book, sheetId, switchSheet, addSheet, editable } = session
const options = computed(() => book.value?.sheets.map(({ id, name }) => ({ value: id, label: name, icon: 'lu:table-2' })) ?? [])
function manage(event: MouseEvent) {
  actionMenu.open(worksheetActions(session), { x: event.clientX, y: event.clientY })
}
</script>
<template>
  <Strip class="sheet-tabs">
    <IconButton size="lg" icon="lu:ellipsis" tooltip="Worksheet actions" :disabled="!editable" @click="manage" />
    <ScrollArea axis="x" passive class="sheet-tab-scroll" content-class="sheet-tab-row"><Segmented :model-value="sheetId" :options="options" aria-label="Worksheets" :disabled="!editable" @update:model-value="switchSheet" /></ScrollArea>
    <template #actions>
      <Button size="sm" variant="secondary" :disabled="!editable || (book?.sheets.length ?? 0) >= 16" @click="addSheet">Add sheet</Button>
    </template>
  </Strip>
</template>
<style scoped>
.sheet-tab-scroll { flex: 1; }
.sheet-tab-scroll :deep(.sheet-tab-row) { display: flex; }
</style>
