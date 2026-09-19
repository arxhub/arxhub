<script setup lang="ts">
import { actionMenu, Button, IconButton, Strip } from '@arxhub/uikit/core'
import { useShellFrame } from '@arxhub/uikit/hooks'
import { useSheet } from './use-sheet'

const buttonSize = useShellFrame() === 'mobile' ? 'lg' : 'sm'
const session = useSheet()
const { status, calculating, save, editable, undo, redo, canUndo, canRedo, selectingRange, selectionLabel } = session
function tools(event: MouseEvent) {
  actionMenu.open(
    [
      { id: 'insert-rows', label: 'Insert selected rows above', icon: 'lu:rows-3', onSelect: () => session.structure('rows', false) },
      { id: 'delete-rows', label: 'Delete selected rows', icon: 'lu:trash-2', onSelect: () => session.structure('rows', true) },
      {
        id: 'insert-columns',
        label: 'Insert selected columns before',
        icon: 'lu:columns-3',
        onSelect: () => session.structure('columns', false),
      },
      { id: 'delete-columns', label: 'Delete selected columns', icon: 'lu:trash-2', onSelect: () => session.structure('columns', true) },
      {
        id: 'format',
        label: 'Format cells',
        icon: 'lu:hash',
        onSelect: () => {
          session.tool.value = 'format'
        },
      },
      {
        id: 'layout',
        label: 'Column width, wrapping and freeze',
        icon: 'lu:panel-top',
        onSelect: () => {
          session.tool.value = 'layout'
        },
      },
      {
        id: 'sort',
        label: 'Sort selected range',
        icon: 'lu:arrow-down-a-z',
        onSelect: () => {
          session.tool.value = 'sort'
        },
      },
      {
        id: 'filter',
        label: 'Filter selected range',
        icon: 'lu:funnel',
        onSelect: () => {
          session.tool.value = 'filter'
        },
      },
      {
        id: 'clear-filter',
        label: 'Clear filter',
        icon: 'lu:funnel-x',
        disabled: !session.hiddenRows.value.size,
        onSelect: () => {
          session.hiddenRows.value = new Set()
        },
      },
      {
        id: 'import-xlsx',
        label: 'Import XLSX workbook',
        icon: 'lu:file-input',
        disabled: session.operationBusy.value,
        onSelect: () => session.xlsxInput.value?.click(),
      },
      {
        id: 'export-xlsx',
        label: 'Export XLSX workbook',
        icon: 'lu:file-output',
        disabled: session.operationBusy.value,
        onSelect: () => {
          void session.downloadExcel()
        },
      },
    ],
    { x: event.clientX, y: event.clientY, title: 'Spreadsheet tools' },
  )
}
function more(event: MouseEvent) {
  actionMenu.open(
    [
      {
        id: 'goto',
        label: 'Go to cell',
        icon: 'lu:locate',
        onSelect: () => {
          session.tool.value = 'goto'
        },
      },
      {
        id: 'select',
        label: selectingRange.value ? 'Finish selecting range' : 'Select range',
        icon: 'lu:scan',
        onSelect: () => {
          selectingRange.value = !selectingRange.value
        },
      },
      {
        id: 'copy',
        label: 'Copy cells',
        icon: 'lu:copy',
        onSelect: () => {
          void session.copy()
        },
      },
      {
        id: 'paste',
        label: 'Paste cells',
        icon: 'lu:clipboard-paste',
        onSelect: () => {
          void session.paste()
        },
      },
      { id: 'clear', label: 'Clear cells', icon: 'lu:eraser', onSelect: session.clear },
      { id: 'fill-down', label: 'Fill down', icon: 'lu:arrow-down', onSelect: () => session.fill('down') },
      { id: 'fill-right', label: 'Fill right', icon: 'lu:arrow-right', onSelect: () => session.fill('right') },
      { id: 'tools', label: 'More tools', icon: 'lu:settings-2', onSelect: () => tools(event) },
      { id: 'rows', label: 'Add 1,000 rows', icon: 'lu:rows-3', onSelect: () => session.grow('rows') },
      { id: 'columns', label: 'Add column', icon: 'lu:columns-3', onSelect: () => session.grow('columns') },
      { id: 'import', label: 'Import CSV at selection', icon: 'lu:file-input', onSelect: () => session.fileInput.value?.click() },
      { id: 'export', label: 'Export CSV (formulas)', icon: 'lu:file-output', onSelect: session.downloadCsv },
      {
        id: 'help',
        label: 'Spreadsheet help',
        icon: 'lu:circle-help',
        onSelect: () => {
          session.tool.value = 'help'
        },
      },
    ],
    { x: event.clientX, y: event.clientY },
  )
}
</script>

<template>
  <Strip class="sheet-bar">
    <!-- Filled on the desktop, where this bar IS the top of the panel; empty on the phone, where it is
         the bottom band and the name has its own strip above the grid. -->
    <span class="sheet-lead"><slot /></span>
    <span class="sheet-status" role="status" :title="selectionLabel">{{ selectingRange ? selectionLabel : status }}{{ calculating ? ' · Calculating…' : '' }}</span>
    <IconButton size="lg" icon="lu:undo-2" tooltip="Undo" :disabled="!canUndo || !editable" @click="undo" />
    <IconButton size="lg" icon="lu:redo-2" tooltip="Redo" :disabled="!canRedo || !editable" @click="redo" />
    <IconButton size="lg" icon="lu:ellipsis" tooltip="Spreadsheet actions" :disabled="!editable" @click="more" />
    <template #actions><Button :size="buttonSize" variant="secondary" :disabled="!editable" @click="save">Save</Button></template>
  </Strip>
</template>

<style scoped>
.sheet-lead:empty { display: none; }
/* Content-width: what leads the bar is a label, and the status line keeps the slack it always had. */
.sheet-lead { display: flex; align-items: center; min-width: 0; }
.sheet-status { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--gray-11); font-size: var(--font-size-xs); }
</style>
