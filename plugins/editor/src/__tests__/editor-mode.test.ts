import { history, undo } from 'prosemirror-history'
import { EditorState } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { editorModeKey, modePlugin } from '../editor-mode'
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
  paragraph('Keep this text'),
])
const selectPos = doc.child(0).nodeSize

describe('document modes', () => {
  it('readonly rejects value edits as well as text, even with a mode-change attached', () => {
    const state = EditorState.create({ doc, plugins: [modePlugin('readonly')] })
    expect(state.apply(state.tr.setNodeMarkup(1, undefined, { checked: true }))).toBe(state)
    expect(state.apply(state.tr.insertText('oops', 3).setMeta(editorModeKey, 'editable'))).toBe(state)
    expect(state.apply(state.tr.setSelection(state.selection))).not.toBe(state)
  })

  it('interactive accepts checkbox and dropdown values, preserving the rest of the document', () => {
    const state = EditorState.create({ doc, plugins: [modePlugin('interactive')] })
    const next = state.apply(
      state.tr.setNodeMarkup(1, undefined, { checked: true }).setNodeMarkup(selectPos, undefined, { ...doc.child(1).attrs, value: 'hi' }),
    )
    expect(next.doc.child(0).child(0).attrs.checked).toBe(true)
    expect(next.doc.child(1).attrs.value).toBe('hi')
    expect(next.doc.textContent).toBe(doc.textContent)
    expect(next.doc.child(2)).toBe(doc.child(2))
  })

  it('interactive rejects text, formatting, structure, configuration and invalid values', () => {
    const state = EditorState.create({ doc, plugins: [modePlugin('interactive')] })
    const changes = [
      state.tr.insertText('oops', 3),
      state.tr.addMark(3, 5, schema.marks.strong.create()),
      state.tr.delete(0, doc.child(0).nodeSize),
      state.tr.insert(doc.content.size, paragraph('extra')),
      state.tr.setNodeMarkup(1, undefined, { checked: 'yes' }),
      state.tr.setNodeMarkup(selectPos, undefined, { ...doc.child(1).attrs, value: 'Unknown' }),
      // A label is not a value: the option is named by its id, or a rename would silently clear it.
      state.tr.setNodeMarkup(selectPos, undefined, { ...doc.child(1).attrs, value: 'High' }),
      state.tr.setNodeMarkup(selectPos, undefined, { ...doc.child(1).attrs, options: [{ id: 'other', label: 'Other' }] }),
      state.tr.setNodeMarkup(selectPos, undefined, { ...doc.child(1).attrs, label: 'Different' }),
      state.tr.setNodeMarkup(1, undefined, { checked: true }).insertText('sneaky', 3),
    ]
    for (const tr of changes) expect(state.apply(tr)).toBe(state)
  })

  it('switching modes neither discards edits nor permits history to change structure in interactive', () => {
    let state = EditorState.create({ doc, plugins: [modePlugin('editable'), history()] })
    state = state.apply(state.tr.insertText('new ', 3))
    const edited = state.doc
    state = state.apply(state.tr.setMeta(editorModeKey, 'interactive'))
    undo(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc).toBe(edited)
    state = state.apply(state.tr.setMeta(editorModeKey, 'editable'))
    undo(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.eq(doc)).toBe(true)
  })
})
