import { closeHistory } from 'prosemirror-history'
import { type Command, TextSelection } from 'prosemirror-state'
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  CellSelection,
  deleteColumn,
  deleteRow,
  deleteTable,
  isInTable,
  mergeCells,
  selectionCell,
  splitCell,
  toggleHeaderRow,
} from 'prosemirror-tables'
import { placeBlocks } from './block-placement'
import { editorMode } from './editor-mode'
import { t } from './i18n/messages'

export const insertTable: Command = (state, dispatch) => {
  const {
    schema,
    selection: { $from, empty },
  } = state
  if (editorMode(state) !== 'editable' || !empty || $from.parent.type !== schema.nodes.paragraph) return false
  const rows = Array.from({ length: 3 }, (_, row) =>
    schema.nodes.table_row.create(
      null,
      Array.from({ length: 3 }, () => (row === 0 ? schema.nodes.table_header : schema.nodes.table_cell).createAndFill()!),
    ),
  )
  const tr = state.tr
  const from = placeBlocks(tr, $from, [schema.nodes.table.create(null, rows), schema.nodes.paragraph.create()])
  if (from === null) return false
  // Into the first header cell's paragraph: table, row, cell, paragraph — one step into each.
  if (dispatch)
    dispatch(
      closeHistory(tr)
        .setSelection(TextSelection.create(tr.doc, from + 4))
        .scrollIntoView(),
    )
  return true
}

const selectCells =
  (row: boolean): Command =>
  (state, dispatch) => {
    if (!isInTable(state)) return false
    if (dispatch) {
      const cell = selectionCell(state)
      const selection = row ? CellSelection.rowSelection(cell, cell) : CellSelection.colSelection(cell, cell)
      dispatch(state.tr.setSelection(selection))
    }
    return true
  }

export const TABLE_ACTIONS = [
  { id: 'select-row', label: () => t('table.selectRow'), icon: 'lu:rows-3', run: selectCells(true) },
  { id: 'select-column', label: () => t('table.selectColumn'), icon: 'lu:columns-3', run: selectCells(false) },
  { id: 'row-before', label: () => t('table.rowBefore'), icon: 'lu:arrow-up-to-line', run: addRowBefore },
  { id: 'row-after', label: () => t('table.rowAfter'), icon: 'lu:arrow-down-to-line', run: addRowAfter },
  { id: 'column-before', label: () => t('table.columnBefore'), icon: 'lu:arrow-left-to-line', run: addColumnBefore },
  { id: 'column-after', label: () => t('table.columnAfter'), icon: 'lu:arrow-right-to-line', run: addColumnAfter },
  { id: 'header', label: () => t('table.header'), icon: 'lu:panel-top', run: toggleHeaderRow },
  { id: 'merge', label: () => t('table.merge'), icon: 'lu:combine', run: mergeCells },
  { id: 'split', label: () => t('table.split'), icon: 'lu:split', run: splitCell },
  { id: 'delete-row', label: () => t('table.deleteRow'), icon: 'lu:trash-2', run: deleteRow },
  { id: 'delete-column', label: () => t('table.deleteColumn'), icon: 'lu:trash-2', run: deleteColumn },
  { id: 'delete-table', label: () => t('table.deleteTable'), icon: 'lu:trash-2', run: deleteTable },
].map((action) => {
  const run: Command = (state, dispatch, view) =>
    editorMode(state) === 'editable' && action.run(state, dispatch ? (tr) => dispatch(closeHistory(tr)) : undefined, view)
  return { ...action, run }
})
