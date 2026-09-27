import { type ActionItem, stepZoomValue } from '@arxhub/uikit/core'
import { t } from '../i18n/messages'
import type { DiffSheetTab } from '../model'
import type { DiffController } from './controller'
import { counterLabel, sheetPartMeta } from './labels'
import { DIFF_ZOOM_STEPS } from './types'

// What an open diff contributes to a band a host describes as data (the phone's object bar): "k из n", the
// two steps, the view options as menu entries, and a workbook's sheets for the host to hang under its part.
// DiffBand draws the same controls itself where no such band exists (saved versions inside a document).
export interface DiffBarControls {
  // The name's quieter half: the sheet on screen, then "k из n". Empty when there is nothing to say.
  sub: string
  actions: ActionItem[]
  menu: ActionItem[]
  sheets: readonly DiffSheetTab[]
  activeSheet: string | null
  pickSheet(id: string): void
}

export function sheetIcon(tab: DiffSheetTab): string {
  if (tab.status === 'added') return 'lu:square-plus'
  if (tab.status === 'removed') return 'lu:square-minus'
  return 'lu:table-2'
}

export function sheetMeta(tab: DiffSheetTab): string {
  return sheetPartMeta(tab.status, tab.stops.length)
}

const ZOOM = { min: DIFF_ZOOM_STEPS[0], max: DIFF_ZOOM_STEPS[DIFF_ZOOM_STEPS.length - 1], steps: DIFF_ZOOM_STEPS }

export function diffBarControls(controller: DiffController, options: { openDocument?: () => void } = {}): DiffBarControls {
  const model = controller.model.value
  const sheets = model?.format === 'sheets' ? model.tabs : []
  const activeSheet = model?.format === 'sheets' ? controller.tabId.value : null
  const sheetName = sheets.find((tab) => tab.id === activeSheet)?.name
  const total = controller.stops.value.length
  const counter = counterLabel(controller.current.value, total)

  const menu: ActionItem[] = []
  if (model?.format === 'sheets') {
    const grid = controller.sheetView.value === 'grid'
    menu.push({
      id: 'diff.view',
      label: t('viewAs', { view: grid ? t('list') : t('grid') }),
      icon: grid ? 'lu:list' : 'lu:grid-3x3',
      onSelect: () => {
        controller.sheetView.value = grid ? 'list' : 'grid'
      },
    })
    if (grid) {
      const only = controller.onlyChangedRows.value
      menu.push(
        {
          id: 'diff.rows',
          label: only ? t('showAllRows') : t('showOnlyChangedRows'),
          icon: 'lu:rows-3',
          onSelect: () => {
            controller.onlyChangedRows.value = !only
          },
        },
        {
          id: 'diff.zoom-out',
          label: t('zoomOut'),
          icon: 'lu:zoom-out',
          disabled: controller.zoom.value <= ZOOM.min,
          onSelect: () => {
            controller.zoom.value = stepZoomValue(controller.zoom.value, -1, ZOOM)
          },
        },
        {
          id: 'diff.zoom-in',
          label: t('zoomIn'),
          icon: 'lu:zoom-in',
          disabled: controller.zoom.value >= ZOOM.max,
          onSelect: () => {
            controller.zoom.value = stepZoomValue(controller.zoom.value, 1, ZOOM)
          },
        },
      )
    }
  }
  if (controller.showSource.value || controller.result.value?.source() != null) {
    const source = controller.showSource.value
    menu.push({
      id: 'diff.source',
      label: source ? t('showDiff') : t('showSource'),
      icon: 'lu:code',
      onSelect: () => {
        controller.showSource.value = !source
      },
    })
  }
  if (options.openDocument != null) {
    menu.push({
      id: 'diff.open-document',
      label: t('openDocument'),
      icon: 'lu:file-text',
      opensObject: true,
      onSelect: options.openDocument,
    })
  }

  return {
    sub: [sheetName, counter].filter((part) => part != null && part !== '').join(' · '),
    actions: [
      {
        id: 'diff.previous',
        label: t('previousTitle'),
        icon: 'lu:arrow-up',
        disabled: total === 0,
        onSelect: () => controller.step(-1),
      },
      { id: 'diff.next', label: t('nextTitle'), icon: 'lu:arrow-down', disabled: total === 0, onSelect: () => controller.step(1) },
    ],
    menu,
    sheets,
    activeSheet,
    pickSheet: (id) => {
      controller.tabId.value = id
    },
  }
}
