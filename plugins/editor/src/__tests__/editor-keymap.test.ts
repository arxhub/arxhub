import { history } from 'prosemirror-history'
import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { buildKeymap } from '../editor-keymap'
import { type EditorMode, editorModeKey, modePlugin } from '../editor-mode'
import { schema } from '../editor-schema'

const paragraph = (text: string) => schema.nodes.paragraph.create(null, schema.text(text))
const doc = schema.nodes.doc.create(null, [
  schema.nodes.task_list.create(null, schema.nodes.task_item.create({ checked: false }, paragraph('Keep this task'))),
  schema.nodes.select.create({ label: 'Priority', options: ['Low', 'High'], value: 'Low' }),
])
const selectPos = doc.child(0).nodeSize
const keys = buildKeymap(schema)

function editor(mode: EditorMode) {
  return EditorState.create({ doc, plugins: [modePlugin(mode), history()] })
}

function press(state: EditorState, chord: string): { state: EditorState; handled: boolean } {
  let next = state
  const handled = keys[chord](state, (tr) => {
    next = state.apply(tr)
  })
  return { state: next, handled }
}

describe('editor keymap by mode', () => {
  it('interactive undoes and redoes a control value, and keeps every other chord out', () => {
    let state = editor('interactive')
    state = state.apply(state.tr.setNodeMarkup(1, undefined, { checked: true }))
    state = state.apply(state.tr.setNodeMarkup(selectPos, undefined, { ...doc.child(1).attrs, value: 'High' }))
    expect(state.doc.child(1).attrs.value).toBe('High')

    let result = press(state, 'Mod-z')
    expect(result.handled).toBe(true)
    expect(result.state.doc.child(1).attrs.value).toBe('Low')
    expect(result.state.doc.child(0).child(0).attrs.checked).toBe(true)
    result = press(result.state, 'Mod-z')
    expect(result.state.doc.eq(doc)).toBe(true)

    result = press(result.state, 'Mod-Shift-z')
    expect(result.state.doc.child(0).child(0).attrs.checked).toBe(true)
    result = press(result.state, 'Mod-y')
    expect(result.state.doc.child(1).attrs.value).toBe('High')

    const bold = press(result.state.apply(result.state.tr.setSelection(TextSelection.create(result.state.doc, 3, 7))), 'Mod-b')
    expect(bold.handled).toBe(false)
    expect(press(result.state, 'Enter').handled).toBe(false)
  })

  it('interactive cannot undo its way back into a text edit made while editable', () => {
    let state = editor('editable')
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)).insertText('new '))
    const edited = state.doc
    state = state.apply(state.tr.setMeta(editorModeKey, 'interactive'))
    const result = press(state, 'Mod-z')
    expect(result.state.doc).toBe(edited)
  })

  it('Enter in the middle of a finished task leaves the new half unfinished', () => {
    const finished = schema.nodes.doc.create(null, [
      schema.nodes.task_list.create(null, schema.nodes.task_item.create({ checked: true }, paragraph('Done'))),
    ])
    // task_list(0) task_item(1) paragraph(2) "Do|ne"
    let state = EditorState.create({ doc: finished, selection: TextSelection.create(finished, 5), plugins: [modePlugin('editable')] })
    const result = press(state, 'Enter')
    expect(result.handled).toBe(true)
    state = result.state
    expect(() => state.doc.check()).not.toThrow()
    const list = state.doc.firstChild
    expect(list?.childCount).toBe(2)
    expect(list?.child(0).textContent).toBe('Do')
    expect(list?.child(0).attrs.checked).toBe(true)
    expect(list?.child(1).textContent).toBe('ne')
    expect(list?.child(1).attrs.checked).toBe(false)
    expect(state.selection.$from.parent).toBe(list?.child(1).firstChild)
    expect(state.selection.$from.parentOffset).toBe(0)
  })

  it('readonly takes no chord at all', () => {
    let state = editor('editable')
    state = state.apply(state.tr.setNodeMarkup(1, undefined, { checked: true }))
    state = state.apply(state.tr.setMeta(editorModeKey, 'readonly'))
    for (const chord of ['Mod-z', 'Mod-Shift-z', 'Mod-y', 'Mod-b', 'Enter']) {
      const result = press(state, chord)
      expect(result.handled, chord).toBe(false)
      expect(result.state, chord).toBe(state)
    }
  })
})
