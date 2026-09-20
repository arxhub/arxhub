import { history } from 'prosemirror-history'
import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { buildKeymap } from '../editor-keymap'
import { type EditorMode, editorModeKey, modePlugin } from '../editor-mode'
import { schema } from '../editor-schema'

const paragraph = (text: string) => schema.nodes.paragraph.create(null, schema.text(text))
const doc = schema.nodes.doc.create(null, [
  schema.nodes.task_list.create(null, schema.nodes.task_item.create({ checked: false }, paragraph('Keep this task'))),
  schema.nodes.select.create({
    label: 'Priority',
    options: [
      { id: 'lo', label: 'Low' },
      { id: 'hi', label: 'High' },
    ],
    value: 'lo',
  }),
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

describe('line breaks', () => {
  it('Shift-Enter replaces selected text inside one paragraph and supports undo/redo', () => {
    const doc = schema.nodes.doc.create(null, paragraph('one two'))
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 4, 5), plugins: [history()] })
    const result = press(state, 'Shift-Enter')
    expect(result.handled).toBe(true)
    expect(result.state.doc.childCount).toBe(1)
    expect(result.state.doc.firstChild?.toJSON().content).toEqual([
      { type: 'text', text: 'one' },
      { type: 'hard_break' },
      { type: 'text', text: 'two' },
    ])
    expect(result.state.selection.from).toBe(5)
    const undone = press(result.state, 'Mod-z')
    expect(undone.state.doc.eq(doc)).toBe(true)
    expect(press(undone.state, 'Mod-Shift-z').state.doc.eq(result.state.doc)).toBe(true)
    expect(press(state, 'Enter').state.doc.childCount).toBe(2)
  })

  it.each(['bullet_list', 'ordered_list', 'task_list'])('keeps Shift-Enter inside the same %s item', (listType) => {
    const itemType = listType === 'task_list' ? 'task_item' : 'list_item'
    const doc = schema.nodes.doc.create(null, schema.nodes[listType].create(null, schema.nodes[itemType].create(null, paragraph('onetwo'))))
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 6) })
    const result = press(state, 'Shift-Enter')
    expect(result.handled).toBe(true)
    expect(result.state.doc.firstChild?.childCount).toBe(1)
    const item = result.state.doc.firstChild?.firstChild
    expect(item?.childCount).toBe(1)
    expect(item?.firstChild?.child(1).type.name).toBe('hard_break')
    expect(item?.textContent).toBe('onetwo')
    expect(() => result.state.doc.check()).not.toThrow()
  })

  it('preserves active formatting across consecutive line breaks', () => {
    const doc = schema.nodes.doc.create(null, paragraph('one'))
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 4) })
    state = state.apply(state.tr.addStoredMark(schema.marks.strong.create()))
    state = press(press(state, 'Shift-Enter').state, 'Shift-Enter').state
    state = state.apply(state.tr.insertText('two'))
    const content = state.doc.child(0)
    expect(content.childCount).toBe(4)
    expect(content.child(1).type.name).toBe('hard_break')
    expect(content.child(2).type.name).toBe('hard_break')
    expect(content.lastChild?.marks[0].type.name).toBe('strong')
  })

  it('inserts a plain newline in code', () => {
    const doc = schema.nodes.doc.create(null, schema.nodes.code_block.create(null, schema.text('onetwo')))
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 4) })
    const result = press(state, 'Shift-Enter')
    expect(result.handled).toBe(true)
    expect(result.state.doc.firstChild?.textContent).toBe('one\ntwo')
    expect(result.state.doc.firstChild?.childCount).toBe(1)
    expect(() => result.state.doc.check()).not.toThrow()
  })
})

describe('editor keymap by mode', () => {
  it('interactive undoes and redoes a control value, and keeps every other chord out', () => {
    let state = editor('interactive')
    state = state.apply(state.tr.setNodeMarkup(1, undefined, { checked: true }))
    state = state.apply(state.tr.setNodeMarkup(selectPos, undefined, { ...doc.child(1).attrs, value: 'hi' }))
    expect(state.doc.child(1).attrs.value).toBe('hi')

    let result = press(state, 'Mod-z')
    expect(result.handled).toBe(true)
    expect(result.state.doc.child(1).attrs.value).toBe('lo')
    expect(result.state.doc.child(0).child(0).attrs.checked).toBe(true)
    result = press(result.state, 'Mod-z')
    expect(result.state.doc.eq(doc)).toBe(true)

    result = press(result.state, 'Mod-Shift-z')
    expect(result.state.doc.child(0).child(0).attrs.checked).toBe(true)
    result = press(result.state, 'Mod-y')
    expect(result.state.doc.child(1).attrs.value).toBe('hi')

    const bold = press(result.state.apply(result.state.tr.setSelection(TextSelection.create(result.state.doc, 3, 7))), 'Mod-b')
    expect(bold.handled).toBe(false)
    expect(press(result.state, 'Enter').handled).toBe(false)
    expect(press(result.state, 'Shift-Enter').handled).toBe(false)
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
    for (const chord of ['Mod-z', 'Mod-Shift-z', 'Mod-y', 'Mod-b', 'Enter', 'Shift-Enter']) {
      const result = press(state, chord)
      expect(result.handled, chord).toBe(false)
      expect(result.state, chord).toBe(state)
    }
  })
})
