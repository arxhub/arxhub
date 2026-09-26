import { DocumentsExtension } from '@arxhub/plugin-documents'
import { type ActionItem, actionMenu } from '@arxhub/uikit/core'
import { useArxHub } from '@arxhub/uikit/hooks'
import { onUnmounted } from 'vue'
import { MAX_SHEETS } from '../workbook'
import { cellActions, toolActions, worksheetActions } from './sheet-actions'
import type { SheetSession } from './use-sheet'

function filled(count: number): string {
  if (count === 0) return 'Empty'
  return count === 1 ? '1 filled cell' : `${count.toLocaleString()} filled cells`
}

// The phone's whole workbook chrome: the band names the workbook and its sheet, the sheets are its parts,
// and every sheet and workbook action sits in its one menu. What stays in the viewer is the formula bar —
// the only input a cell is typed into — which is left directly on the keyboard while typing, because the
// frame puts the band away when a viewer declares no editing toolbar of its own.
export function useSheetBar(path: () => string, session: SheetSession): void {
  const documents = useArxHub().extensions.get(DocumentsExtension)
  onUnmounted(
    documents.registerViewBar(path, () => {
      const { book, sheetId, sheetName, editable, selectingRange, selectionLabel, status } = session
      const sheets = book.value?.sheets ?? []
      const locked = (items: ActionItem[]) => items.map((item) => ({ ...item, disabled: item.disabled === true || !editable.value }))
      const newSheet: ActionItem = {
        id: 'sheets.add',
        label: 'New sheet',
        icon: 'lu:plus',
        disabled: !editable.value || sheets.length >= MAX_SHEETS,
        onSelect: session.addSheet,
      }
      const tools = () => actionMenu.open(locked(toolActions(session)), { title: 'Spreadsheet tools' })
      return {
        icon: 'lu:table-2',
        // The save state rides after the sheet, as the desktop bar's status line carries it — silent while
        // saved, the way the editor's band is: the one word that matters must not drown in a constant one.
        sub:
          [
            selectingRange.value ? `${sheetName.value} · ${selectionLabel.value}` : sheetName.value,
            status.value === 'Saved' ? '' : status.value,
          ]
            .filter((part) => part !== '')
            .join(' · ') || undefined,
        parts: {
          title: 'Sheets',
          items: sheets.map((entry) => ({
            id: entry.id,
            title: entry.name,
            subtitle: filled(Object.keys(entry.sheet.cells).length),
            icon: 'lu:table-2',
            selected: entry.id === sheetId.value,
          })),
          pick: session.switchSheet,
          add: newSheet,
        },
        menu: [
          ...locked([
            { id: 'sheets.undo', label: 'Undo', icon: 'lu:undo-2', disabled: !session.canUndo.value, onSelect: session.undo },
            { id: 'sheets.redo', label: 'Redo', icon: 'lu:redo-2', disabled: !session.canRedo.value, onSelect: session.redo },
            ...cellActions(session, tools),
            {
              id: 'sheets.save',
              label: 'Save',
              icon: 'lu:save',
              onSelect: () => {
                void session.save()
              },
            },
          ]),
          newSheet,
          ...locked(worksheetActions(session)),
        ],
      }
    }),
  )
}
