import { history, undo } from 'prosemirror-history'
import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { changeBlock, insertBlock } from '../block-actions'
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

  it('refuses moves past the document and selections crossing blocks', () => {
    const first = EditorState.create({ doc })
    expect(changeBlock('up')(first)).toBe(false)
    const range = EditorState.create({ doc, selection: TextSelection.create(doc, 2, second + 2) })
    expect(changeBlock('delete')(range)).toBe(false)
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
  })
})
