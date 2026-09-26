import type { ActionItem } from '@arxhub/uikit/core'
import type { SheetSession } from './use-sheet'

// One list per concern, drawn by both frames: the desktop opens them from its own bars, the phone puts
// them in the object band's menu. Two copies of these labels would drift the first time one was renamed.

export function toolActions(session: SheetSession): ActionItem[] {
  const tool = (id: NonNullable<SheetSession['tool']['value']>) => () => {
    session.tool.value = id
  }
  return [
    { id: 'insert-rows', label: 'Insert selected rows above', icon: 'lu:rows-3', onSelect: () => session.structure('rows', false) },
    { id: 'delete-rows', label: 'Delete selected rows', icon: 'lu:trash-2', onSelect: () => session.structure('rows', true) },
    {
      id: 'insert-columns',
      label: 'Insert selected columns before',
      icon: 'lu:columns-3',
      onSelect: () => session.structure('columns', false),
    },
    { id: 'delete-columns', label: 'Delete selected columns', icon: 'lu:trash-2', onSelect: () => session.structure('columns', true) },
    { id: 'format', label: 'Format cells', icon: 'lu:hash', onSelect: tool('format') },
    { id: 'layout', label: 'Column width, wrapping and freeze', icon: 'lu:panel-top', onSelect: tool('layout') },
    { id: 'sort', label: 'Sort selected range', icon: 'lu:arrow-down-a-z', onSelect: tool('sort') },
    { id: 'filter', label: 'Filter selected range', icon: 'lu:funnel', onSelect: tool('filter') },
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
  ]
}

// `tools` opens the list above: a menu inside a menu is the caller's to present.
export function cellActions(session: SheetSession, tools: () => void): ActionItem[] {
  return [
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
      label: session.selectingRange.value ? 'Finish selecting range' : 'Select range',
      icon: 'lu:scan',
      onSelect: () => {
        session.selectingRange.value = !session.selectingRange.value
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
    { id: 'tools', label: 'More tools', icon: 'lu:settings-2', onSelect: tools },
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
  ]
}

export function worksheetActions(session: SheetSession): ActionItem[] {
  return [
    {
      id: 'rename-sheet',
      label: 'Rename sheet',
      icon: 'lu:pencil',
      onSelect: () => {
        session.tool.value = 'rename'
      },
    },
    {
      id: 'delete-sheet',
      label: 'Delete sheet',
      icon: 'lu:trash-2',
      tone: 'danger',
      disabled: (session.book.value?.sheets.length ?? 0) < 2,
      onSelect: () => {
        session.tool.value = 'delete'
      },
    },
  ]
}
