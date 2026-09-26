<script setup lang="ts">
import { actionMenu, Button, IconButton, Strip } from '@arxhub/uikit/core'
import { cellActions, toolActions } from './sheet-actions'
import { useSheet } from './use-sheet'

const session = useSheet()
const { status, calculating, save, editable, undo, redo, canUndo, canRedo, selectingRange, selectionLabel } = session
function more(event: MouseEvent) {
  const tools = () => actionMenu.open(toolActions(session), { x: event.clientX, y: event.clientY, title: 'Spreadsheet tools' })
  actionMenu.open(cellActions(session, tools), { x: event.clientX, y: event.clientY })
}
</script>

<template>
  <Strip class="sheet-bar">
    <span class="sheet-lead"><slot /></span>
    <span class="sheet-status" role="status" :title="selectionLabel">{{ selectingRange ? selectionLabel : status }}{{ calculating ? ' · Calculating…' : '' }}</span>
    <IconButton size="lg" icon="lu:undo-2" tooltip="Undo" :disabled="!canUndo || !editable" @click="undo" />
    <IconButton size="lg" icon="lu:redo-2" tooltip="Redo" :disabled="!canRedo || !editable" @click="redo" />
    <IconButton size="lg" icon="lu:ellipsis" tooltip="Spreadsheet actions" :disabled="!editable" @click="more" />
    <template #actions><Button size="sm" variant="secondary" :disabled="!editable" @click="save">Save</Button></template>
  </Strip>
</template>

<style scoped>
.sheet-lead:empty { display: none; }
/* Content-width: what leads the bar is a label, and the status line keeps the slack it always had. */
.sheet-lead { display: flex; align-items: center; min-width: 0; }
.sheet-status { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--gray-11); font-size: var(--font-size-xs); }
</style>
