import { history, undo } from 'prosemirror-history'
import { EditorState } from 'prosemirror-state'
import { CellSelection, TableMap, tableEditing } from 'prosemirror-tables'
import { describe, expect, it } from 'vitest'
import { deserialize, serialize } from '../editor-format'
import { editorModeKey, modePlugin } from '../editor-mode'
import { schema } from '../editor-schema'
import { insertTable, TABLE_ACTIONS } from '../table-actions'

describe('document tables', () => {
  it('inserts a grid, merges and splits cells, preserves content and undoes a structural change', () => {
    let state = EditorState.create({ schema, plugins: [modePlugin('editable'), history(), tableEditing()] })
    const dispatch = (tr: Parameters<EditorState['apply']>[0]) => {
      state = state.apply(tr)
    }
    insertTable(state, dispatch)
    expect(state.doc.firstChild?.childCount).toBe(3)
    dispatch(state.tr.insertText('A'))
    const table = state.doc.firstChild!
    const map = TableMap.get(table)
    dispatch(state.tr.setSelection(CellSelection.create(state.doc, 1 + map.map[0], 1 + map.map[1])))
    const before = state.doc
    const merge = TABLE_ACTIONS.find((action) => action.id === 'merge')!.run
    expect(merge(state, dispatch)).toBe(true)
    expect(state.doc.firstChild?.firstChild?.firstChild?.attrs.colspan).toBe(2)
    expect(state.doc.textContent).toBe('A')
    expect(TableMap.get(state.doc.firstChild!).problems).toBeNull()
    expect(deserialize(schema, serialize(state.doc)).eq(state.doc)).toBe(true)
    undo(state, dispatch)
    expect(state.doc.eq(before)).toBe(true)
    merge(state, dispatch)
    TABLE_ACTIONS.find((action) => action.id === 'split')!.run(state, dispatch)
    expect(state.doc.firstChild?.firstChild?.childCount).toBe(3)
    expect(state.doc.textContent).toBe('A')
    for (const mode of ['readonly', 'interactive']) {
      dispatch(state.tr.setMeta(editorModeKey, mode))
      expect(TABLE_ACTIONS.find((action) => action.id === 'row-after')!.run(state)).toBe(false)
    }
  })
})
