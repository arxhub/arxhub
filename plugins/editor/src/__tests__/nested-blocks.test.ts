import { history, undo } from 'prosemirror-history'
import { type Command, EditorState, Selection, TextSelection } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { changeBlock, insertParagraphBeside, moveBlocksTo } from '../block-actions'
import { BlockSelection, selectBlocks, selectedBlocks } from '../block-selection'
import { transformBlocks } from '../block-transforms'
import { schema } from '../editor-schema'

const p = (text: string) => schema.nodes.paragraph.create(null, schema.text(text))
const quote = schema.nodes.blockquote.create(null, [p('One'), p('Two'), p('Three')])
function editor() {
  const doc = schema.nodes.doc.create(null, [p('Before'), quote, p('After')])
  const start = doc.child(0).nodeSize + 1
  return EditorState.create({ doc, selection: TextSelection.create(doc, start + quote.child(0).nodeSize + 1), plugins: [history()] })
}
function run(state: EditorState, command: Command) {
  let next = state
  expect(
    command(state, (tr) => {
      next = state.apply(tr)
    }),
  ).toBe(true)
  expect(() => next.doc.check()).not.toThrow()
  return next
}

describe('nested block scope', () => {
  it.each(['up', 'down', 'duplicate', 'delete'] as const)('%s changes the paragraph inside the quote and undoes exactly', (action) => {
    const state = editor()
    const next = run(state, changeBlock(action))
    expect(next.doc.child(0).eq(state.doc.child(0))).toBe(true)
    expect(next.doc.child(2).eq(state.doc.child(2))).toBe(true)
    expect(next.doc.child(1).children.map((node) => node.textContent)).toEqual(
      {
        up: ['Two', 'One', 'Three'],
        down: ['One', 'Three', 'Two'],
        duplicate: ['One', 'Two', 'Two', 'Three'],
        delete: ['One', 'Three'],
      }[action],
    )
    expect(run(next, undo).doc.eq(state.doc)).toBe(true)
  })

  it('transforms just the nested paragraph and explicitly selects its container for a whole-block action', () => {
    const state = editor()
    const transformed = run(state, transformBlocks('heading-2'))
    expect(transformed.doc.child(1).child(1).type.name).toBe('heading')
    expect(transformed.doc.child(1).child(0).type.name).toBe('paragraph')
    const parent = run(transformed, selectBlocks('parent'))
    expect(parent.selection.content().content.firstChild?.type.name).toBe('blockquote')
    const copy = run(parent, changeBlock('duplicate'))
    expect(copy.doc.childCount).toBe(4)
    expect(copy.doc.child(1).eq(copy.doc.child(2))).toBe(true)
  })

  it('moves a nested selection among siblings and retains a valid selection bookmark', () => {
    let state = run(editor(), selectBlocks('current'))
    const original = state
    const range = selectedBlocks(state)
    if (!range) throw new Error('Expected selected blocks')
    state = run(state, moveBlocksTo(range.start + range.parent.content.size))
    expect(state.doc.child(1).textContent).toBe('OneThreeTwo')
    expect(Selection.fromJSON(state.doc, state.selection.toJSON()).eq(state.selection)).toBe(true)
    state = run(state, undo)
    expect(state.doc.eq(original.doc)).toBe(true)
    expect(state.selection.eq(original.selection)).toBe(true)
  })

  it('inserts before and after at the same nesting level', () => {
    const state = editor()
    for (const side of ['before', 'after'] as const) {
      const next = run(state, insertParagraphBeside(side))
      expect(next.doc.childCount).toBe(3)
      expect(next.doc.child(1).childCount).toBe(4)
      expect(next.selection.$from.depth).toBe(2)
      expect(next.doc.child(1).child(side === 'before' ? 1 : 2).textContent).toBe('')
    }
  })

  it('edits cell paragraphs without changing the table shape and can select the whole table', () => {
    const grid = schema.nodes.table.create(
      null,
      schema.nodes.table_row.create(null, [
        schema.nodes.table_cell.create(null, [p('First'), p('Second')]),
        schema.nodes.table_cell.create(null, p('Other cell')),
      ]),
    )
    const doc = schema.nodes.doc.create(null, grid)
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 4), plugins: [history()] })
    const next = run(state, transformBlocks('heading-1'))
    expect(next.doc.firstChild?.firstChild?.firstChild?.firstChild?.type.name).toBe('heading')
    expect(next.doc.firstChild?.firstChild?.childCount).toBe(2)
    const parent = run(next, selectBlocks('parent'))
    expect(parent.selection.content().content.firstChild?.type.name).toBe('table')
  })

  it('nested disjoint selections do not include their unselected siblings', () => {
    let state = editor()
    const range = selectedBlocks(state)
    if (!range) throw new Error('Expected selected blocks')
    const first = range.start
    const third = first + quote.child(0).nodeSize + quote.child(1).nodeSize
    state = state.apply(
      state.tr.setSelection(
        BlockSelection.fromSpans(state.doc, [
          { from: first, to: first + quote.child(0).nodeSize },
          { from: third, to: third + quote.child(2).nodeSize },
        ]),
      ),
    )
    const next = run(state, changeBlock('duplicate'))
    expect(next.doc.child(1).children.map((node) => node.textContent)).toEqual(['One', 'Two', 'Three', 'One', 'Three'])
    expect(run(next, undo).doc.eq(state.doc)).toBe(true)
  })
})
