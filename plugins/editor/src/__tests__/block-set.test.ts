import { history, undo } from 'prosemirror-history'
import { EditorState } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { changeBlock, moveBlocksTo } from '../block-actions'
import { BlockSelection } from '../block-selection'
import { transformBlocks } from '../block-transforms'
import { arrangeColumns } from '../columns'
import { schema } from '../editor-schema'

function selected() {
  const doc = schema.node(
    'doc',
    null,
    ['A', 'B', 'C', 'D'].map((text) => schema.node('paragraph', null, schema.text(text))),
  )
  return EditorState.create({
    doc,
    selection: BlockSelection.fromSpans(doc, [
      { from: 0, to: 3 },
      { from: 6, to: 9 },
    ]),
    plugins: [history()],
  })
}

describe('disjoint block groups', () => {
  it('copies only selected blocks and deletes them with one undo', () => {
    let state = selected()
    expect(state.selection.content().content.textBetween(0, 6)).toBe('AC')
    changeBlock('delete')(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.textContent).toBe('BD')
    undo(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.textContent).toBe('ABCD')
    expect(state.selection.ranges).toHaveLength(2)
  })
  it('moves and transforms selected blocks without modifying their neighbours', () => {
    let state = selected()
    transformBlocks('heading-2')(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.children.map((node) => node.type.name)).toEqual(['heading', 'paragraph', 'heading', 'paragraph'])
    moveBlocksTo(state.doc.content.size)(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.textContent).toBe('BDAC')
  })
  it('arranges selected content into columns and can stack it without losing content', () => {
    let state = selected()
    arrangeColumns(2)(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.firstChild?.type.name).toBe('columns')
    expect(state.doc.firstChild?.children.map((column) => column.textContent)).toEqual(['A', 'C'])
    expect(state.doc.textContent).toBe('ACBD')
    arrangeColumns(1)(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.children.map((node) => node.type.name)).toEqual(['paragraph', 'paragraph', 'paragraph', 'paragraph'])
    expect(state.doc.textContent).toBe('ACBD')
  })
})
