import type { ActionItem } from '@arxhub/uikit/core'
import { t } from '../i18n/messages'
import type { SheetSession } from './use-sheet'

// One list per concern, drawn by both frames: the desktop opens them from its own bars, the phone puts
// them in the object band's menu. Two copies of these labels would drift the first time one was renamed.

export function toolActions(session: SheetSession): ActionItem[] {
  const tool = (id: NonNullable<SheetSession['tool']['value']>) => () => {
    session.tool.value = id
  }
  return [
    { id: 'insert-rows', label: t('actions.insertRows'), icon: 'lu:rows-3', onSelect: () => session.structure('rows', false) },
    { id: 'delete-rows', label: t('actions.deleteRows'), icon: 'lu:trash-2', onSelect: () => session.structure('rows', true) },
    {
      id: 'insert-columns',
      label: t('actions.insertColumns'),
      icon: 'lu:columns-3',
      onSelect: () => session.structure('columns', false),
    },
    { id: 'delete-columns', label: t('actions.deleteColumns'), icon: 'lu:trash-2', onSelect: () => session.structure('columns', true) },
    { id: 'format', label: t('actions.format'), icon: 'lu:hash', onSelect: tool('format') },
    { id: 'layout', label: t('actions.layout'), icon: 'lu:panel-top', onSelect: tool('layout') },
    { id: 'sort', label: t('actions.sort'), icon: 'lu:arrow-down-a-z', onSelect: tool('sort') },
    { id: 'filter', label: t('actions.filter'), icon: 'lu:funnel', onSelect: tool('filter') },
    {
      id: 'clear-filter',
      label: t('actions.clearFilter'),
      icon: 'lu:funnel-x',
      disabled: !session.hiddenRows.value.size,
      onSelect: () => {
        session.hiddenRows.value = new Set()
      },
    },
    {
      id: 'import-xlsx',
      label: t('actions.importXlsx'),
      icon: 'lu:file-input',
      disabled: session.operationBusy.value,
      onSelect: () => session.xlsxInput.value?.click(),
    },
    {
      id: 'export-xlsx',
      label: t('actions.exportXlsx'),
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
      label: t('actions.goto'),
      icon: 'lu:locate',
      onSelect: () => {
        session.tool.value = 'goto'
      },
    },
    {
      id: 'select',
      label: session.selectingRange.value ? t('actions.finishRange') : t('actions.selectRange'),
      icon: 'lu:scan',
      onSelect: () => {
        session.selectingRange.value = !session.selectingRange.value
      },
    },
    {
      id: 'copy',
      label: t('actions.copy'),
      icon: 'lu:copy',
      onSelect: () => {
        void session.copy()
      },
    },
    {
      id: 'paste',
      label: t('actions.paste'),
      icon: 'lu:clipboard-paste',
      onSelect: () => {
        void session.paste()
      },
    },
    { id: 'clear', label: t('actions.clear'), icon: 'lu:eraser', onSelect: session.clear },
    { id: 'fill-down', label: t('actions.fillDown'), icon: 'lu:arrow-down', onSelect: () => session.fill('down') },
    { id: 'fill-right', label: t('actions.fillRight'), icon: 'lu:arrow-right', onSelect: () => session.fill('right') },
    { id: 'tools', label: t('actions.moreTools'), icon: 'lu:settings-2', onSelect: tools },
    { id: 'rows', label: t('actions.addRows'), icon: 'lu:rows-3', onSelect: () => session.grow('rows') },
    { id: 'columns', label: t('actions.addColumn'), icon: 'lu:columns-3', onSelect: () => session.grow('columns') },
    { id: 'import', label: t('actions.importCsv'), icon: 'lu:file-input', onSelect: () => session.fileInput.value?.click() },
    { id: 'export', label: t('actions.exportCsv'), icon: 'lu:file-output', onSelect: session.downloadCsv },
    {
      id: 'help',
      label: t('actions.help'),
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
      label: t('actions.renameSheet'),
      icon: 'lu:pencil',
      onSelect: () => {
        session.tool.value = 'rename'
      },
    },
    {
      id: 'delete-sheet',
      label: t('actions.deleteSheet'),
      icon: 'lu:trash-2',
      tone: 'danger',
      disabled: (session.book.value?.sheets.length ?? 0) < 2,
      onSelect: () => {
        session.tool.value = 'delete'
      },
    },
  ]
}
