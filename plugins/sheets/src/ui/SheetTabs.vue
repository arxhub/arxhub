<script setup lang="ts">
// biome-ignore lint/correctness/noUnusedImports: used in template
import { actionMenu, Button, IconButton, ScrollArea, Segmented, Strip } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { useSheet } from './use-sheet'

const touch = useShellFrame() === 'mobile'
const buttonSize = touch ? 'lg' : 'sm'
const iconSize = touch ? 'xl' : 'lg'
const { book, sheetId, switchSheet, addSheet, editable, tool } = useSheet()
const options = computed(() => book.value?.sheets.map(({ id, name }) => ({ value: id, label: name, icon: 'lu:table-2' })) ?? [])
function manage(event: MouseEvent) {
  actionMenu.open(
    [
      {
        id: 'rename',
        label: 'Rename sheet',
        icon: 'lu:pencil',
        onSelect: () => {
          tool.value = 'rename'
        },
      },
      {
        id: 'delete',
        label: 'Delete sheet',
        icon: 'lu:trash-2',
        disabled: (book.value?.sheets.length ?? 0) < 2,
        onSelect: () => {
          tool.value = 'delete'
        },
      },
    ],
    { x: event.clientX, y: event.clientY },
  )
}
</script>
<template>
  <Strip class="sheet-tabs">
    <IconButton :size="iconSize" icon="lu:ellipsis" tooltip="Worksheet actions" :disabled="!editable" @click="manage" />
    <ScrollArea axis="x" passive class="sheet-tab-scroll" content-class="sheet-tab-row"><Segmented :model-value="sheetId" :options="options" aria-label="Worksheets" :disabled="!editable" @update:model-value="switchSheet" /></ScrollArea>
    <template #actions>
      <Button :size="buttonSize" variant="secondary" :disabled="!editable || (book?.sheets.length ?? 0) >= 16" @click="addSheet">Add sheet</Button>
    </template>
  </Strip>
</template>
<style scoped>
.sheet-tab-scroll { flex: 1; }
.sheet-tab-scroll :deep(.sheet-tab-row) { display: flex; }
</style>
