<script setup lang="ts">
import { actionMenu, Button, IconButton, Segmented, Strip } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { computed } from 'vue'
import { useSheet } from './use-sheet'

const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
const { book, sheetId, switchSheet, addSheet, editable, tool } = useSheet()
const options = computed(() => book.value?.sheets.map(({ id, name }) => ({ value: id, label: name })) ?? [])
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
    <IconButton size="lg" icon="lu:ellipsis" tooltip="Worksheet actions" :disabled="!editable" @click="manage" />
    <div class="sheet-tab-scroll"><Segmented :model-value="sheetId" :options="options" aria-label="Worksheets" :disabled="!editable" @update:model-value="switchSheet" /></div>
    <template #actions>
      <Button :size="buttonSize" variant="secondary" :disabled="!editable || (book?.sheets.length ?? 0) >= 16" @click="addSheet">Add sheet</Button>
    </template>
  </Strip>
</template>
<style scoped>
.sheet-tab-scroll { flex: 1; min-width: 0; overflow: auto; }
</style>
