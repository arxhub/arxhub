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
import { editorMode } from './editor-mode'

export const insertTable: Command = (state, dispatch) => {
  const {
    schema,
    selection: { $from },
  } = state
  if (editorMode(state) !== 'editable' || $from.parent.type !== schema.nodes.paragraph || $from.parent.content.size) return false
  if (dispatch) {
    const rows = Array.from({ length: 3 }, (_, row) =>
      schema.nodes.table_row.create(
        null,
        Array.from({ length: 3 }, () => (row === 0 ? schema.nodes.table_header : schema.nodes.table_cell).createAndFill()!),
      ),
    )
    const from = $from.before()
    const tr = state.tr.replaceWith(from, $from.after(), [schema.nodes.table.create(null, rows), schema.nodes.paragraph.create()])
    dispatch(
      closeHistory(tr)
        .setSelection(TextSelection.create(tr.doc, from + 4))
        .scrollIntoView(),
    )
  }
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
  { id: 'select-row', label: 'Select row', icon: 'lu:rows-3', run: selectCells(true) },
  { id: 'select-column', label: 'Select column', icon: 'lu:columns-3', run: selectCells(false) },
  { id: 'row-before', label: 'Insert row above', icon: 'lu:arrow-up-to-line', run: addRowBefore },
  { id: 'row-after', label: 'Insert row below', icon: 'lu:arrow-down-to-line', run: addRowAfter },
  { id: 'column-before', label: 'Insert column left', icon: 'lu:arrow-left-to-line', run: addColumnBefore },
  { id: 'column-after', label: 'Insert column right', icon: 'lu:arrow-right-to-line', run: addColumnAfter },
  { id: 'header', label: 'Toggle header row', icon: 'lu:panel-top', run: toggleHeaderRow },
  { id: 'merge', label: 'Merge cells', icon: 'lu:combine', run: mergeCells },
  { id: 'split', label: 'Split cell', icon: 'lu:split', run: splitCell },
  { id: 'delete-row', label: 'Delete row', icon: 'lu:trash-2', run: deleteRow },
  { id: 'delete-column', label: 'Delete column', icon: 'lu:trash-2', run: deleteColumn },
  { id: 'delete-table', label: 'Delete table', icon: 'lu:trash-2', run: deleteTable },
].map((action) => {
  const run: Command = (state, dispatch, view) =>
    editorMode(state) === 'editable' && action.run(state, dispatch ? (tr) => dispatch(closeHistory(tr)) : undefined, view)
  return { ...action, run }
})
