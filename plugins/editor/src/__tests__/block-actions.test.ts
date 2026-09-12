import { history, undo } from 'prosemirror-history'
import { AllSelection, EditorState, Selection, TextSelection } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { changeBlock, insertBlock, moveBlocksTo } from '../block-actions'
import { BlockSelection, selectBlocks } from '../block-selection'
import { transformBlocks } from '../block-transforms'
import { modePlugin } from '../editor-mode'
import { schema } from '../editor-schema'
import { BLOCK_COMMANDS } from '../slash-commands'

const paragraph = (text: string) => schema.node('paragraph', null, text ? schema.text(text) : undefined)
const doc = schema.node('doc', null, [paragraph('First'), paragraph('Second'), paragraph('Third')])
const second = doc.child(0).nodeSize
const editor = () => EditorState.create({ doc, selection: TextSelection.create(doc, second + 2), plugins: [modePlugin('editable'), history()] })

describe('document blocks', () => {
  it.each([
    ['up', ['Second', 'First', 'Third']],
    ['down', ['First', 'Third', 'Second']],
    ['duplicate', ['First', 'Second', 'Second', 'Third']],
    ['delete', ['First', 'Third']],
  ] as const)('%s preserves neighboring blocks and can be undone as one action', (action, expected) => {
    let state = editor()
    expect(
      changeBlock(action)(state, (tr) => {
        state = state.apply(tr)
      }),
    ).toBe(true)
    const texts: string[] = []
    state.doc.forEach((node) => {
      texts.push(node.textContent)
    })
    expect(texts).toEqual(expected)
    state.doc.check()
    undo(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.eq(doc)).toBe(true)
  })

  it('refuses moves past the document and deletes whole blocks crossed by a text selection', () => {
    const first = EditorState.create({ doc })
    expect(changeBlock('up')(first)).toBe(false)
    const range = EditorState.create({ doc, selection: TextSelection.create(doc, 2, second + 2) })
    let result = range
    expect(
      changeBlock('delete')(range, (tr) => {
        result = result.apply(tr)
      }),
    ).toBe(true)
    expect(result.doc.childCount).toBe(1)
    expect(result.doc.firstChild?.textContent).toBe('Third')
  })

  it('deleting the final block leaves a writable paragraph', () => {
    let state = EditorState.create({ doc: schema.node('doc', null, paragraph('Only block')) })
    changeBlock('delete')(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.toJSON()).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
    expect(state.selection.$from.parent.type.name).toBe('paragraph')
  })

  it('inserts each block after existing content without replacing the selection', () => {
    for (const command of BLOCK_COMMANDS) {
      let state = editor()
      expect(
        insertBlock(command)(state, (tr) => {
          state = state.apply(tr)
        }),
        command.id,
      ).toBe(true)
      state.doc.check()
      expect(state.doc.child(0).eq(doc.child(0))).toBe(true)
      expect(state.doc.child(1).eq(doc.child(1))).toBe(true)
      expect(state.doc.lastChild?.eq(doc.lastChild!)).toBe(true)
      undo(state, (tr) => {
        state = state.apply(tr)
      })
      expect(state.doc.eq(doc)).toBe(true)
    }
  })

  it.each(['readonly', 'interactive'] as const)('%s refuses block edits at the command boundary', (mode) => {
    const state = EditorState.create({ doc, plugins: [modePlugin(mode)] })
    expect(changeBlock('delete')(state)).toBe(false)
    expect(insertBlock(BLOCK_COMMANDS[0])(state)).toBe(false)
    expect(moveBlocksTo(doc.content.size)(state)).toBe(false)
    expect(transformBlocks('task_list')(state)).toBe(false)
  })

  it('moves a selection containing multiple blocks, keeping an exact undo bookmark', () => {
    let state = editor()
    selectBlocks('next')(state, (tr) => {
      state = state.apply(tr)
    })
    const selected = state.selection
    expect(selected instanceof BlockSelection).toBe(true)
    moveBlocksTo(0)(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.children.map((node) => node.textContent)).toEqual(['Second', 'Third', 'First'])
    expect(state.selection.content().content.childCount).toBe(2)
    expect(Selection.fromJSON(state.doc, state.selection.toJSON()).eq(state.selection)).toBe(true)
    undo(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.eq(doc)).toBe(true)
    expect(state.selection.eq(selected)).toBe(true)
  })

  it('maps block selections through edits before them, and recovers when their blocks disappear', () => {
    let state = editor()
    selectBlocks('current')(state, (tr) => {
      state = state.apply(tr)
    })
    state = state.apply(state.tr.insert(0, paragraph('Before')))
    expect(state.selection.content().content.firstChild?.textContent).toBe('Second')
    state = state.apply(state.tr.delete(state.selection.from, state.selection.to))
    expect(state.selection instanceof BlockSelection).toBe(false)
    state.doc.check()
  })

  it('deleting all selected blocks leaves one writable paragraph', () => {
    let state = EditorState.create({ doc, selection: new AllSelection(doc) })
    changeBlock('delete')(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.toJSON()).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
  })

  it('turns multiple paragraphs into tasks and back with marks intact', () => {
    const original = schema.node('doc', null, [
      schema.node('paragraph', null, schema.text('Bold', [schema.marks.strong.create()])),
      paragraph('Next'),
    ])
    let state = EditorState.create({ doc: original, selection: new AllSelection(original), plugins: [history()] })
    transformBlocks('task_list')(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.firstChild?.type.name).toBe('task_list')
    expect(state.doc.firstChild?.childCount).toBe(2)
    transformBlocks('paragraph')(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.eq(original)).toBe(true)
    undo(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.firstChild?.type.name).toBe('task_list')
    undo(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.eq(original)).toBe(true)
  })

  it('changing list type keeps nested lists, and refuses transformations that would erase a component', () => {
    const nested = schema.node('bullet_list', null, schema.node('list_item', null, paragraph('Nested')))
    const list = schema.node('bullet_list', null, schema.node('list_item', null, [paragraph('Parent'), nested]))
    let state = EditorState.create({ doc: schema.node('doc', null, list) })
    transformBlocks('task_list')(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.firstChild?.firstChild?.lastChild?.eq(nested)).toBe(true)
    const component = EditorState.create({ doc: schema.node('doc', null, schema.nodes.select.create()) })
    expect(transformBlocks('paragraph')(component)).toBe(false)
    expect(transformBlocks('task_list')(component)).toBe(false)
    expect(transformBlocks('blockquote')(component)).toBe(true)
  })
})
