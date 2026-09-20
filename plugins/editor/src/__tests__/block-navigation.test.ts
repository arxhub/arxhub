import { closeHistory, history, undo } from 'prosemirror-history'
import type { Node } from 'prosemirror-model'
import { type Command, EditorState, NodeSelection, TextSelection } from 'prosemirror-state'
import { CellSelection } from 'prosemirror-tables'
import type { EditorView } from 'prosemirror-view'
import { describe, expect, it } from 'vitest'
import { continueAfterBlock, exitBlockDown } from '../block-navigation'
import { BlockSelection } from '../block-selection'
import { deserialize, serialize } from '../editor-format'
import { buildKeymap } from '../editor-keymap'
import { modePlugin } from '../editor-mode'
import { schema } from '../editor-schema'

const paragraph = (text = '') => schema.nodes.paragraph.create(null, text ? schema.text(text) : null)
const cell = (text: string, attrs = {}) => schema.nodes.table_cell.create(attrs, paragraph(text))
const row = (...cells: Node[]) => schema.nodes.table_row.create(null, cells)
const table = () => schema.nodes.table.create(null, [row(cell('A'), cell('B')), row(cell('C'), cell('D'))])
const wrappers = [
  table(),
  schema.nodes.blockquote.create(null, paragraph('Body')),
  schema.nodes.callout.create(null, paragraph('Body')),
  schema.nodes.section.create(null, paragraph('Body')),
  schema.nodes.columns.create(null, [
    schema.nodes.column.create(null, paragraph('Body')),
    schema.nodes.column.create(null, paragraph('Other')),
  ]),
  schema.nodes.bullet_list.create(null, schema.nodes.list_item.create(null, paragraph('Body'))),
  schema.nodes.ordered_list.create(null, schema.nodes.list_item.create(null, paragraph('Body'))),
  schema.nodes.task_list.create(null, schema.nodes.task_item.create({ checked: true }, paragraph('Body'))),
  schema.nodes.code_block.create(null, schema.text('Body')),
]

function atText(state: EditorState, text: string, end = true): EditorState {
  let position = -1
  state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) position = pos + (end ? node.nodeSize : 0)
  })
  if (position < 0) throw new Error(`Missing text: ${text}`)
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, position)))
}

function run(command: Command, state: EditorState, bottomLine = true) {
  let next = state
  // The unit test supplies only the layout answer; Playwright verifies actual visual lines.
  const view = { endOfTextblock: () => bottomLine } as unknown as EditorView
  const handled = command(
    state,
    (tr) => {
      next = state.apply(tr)
    },
    view,
  )
  if (handled) expect(() => next.doc.check()).not.toThrow()
  return { state: next, handled }
}

function editor(...blocks: Node[]) {
  return EditorState.create({ doc: schema.nodes.doc.create(null, blocks), plugins: [history()] })
}

describe('continue after a block', () => {
  it.each(wrappers.map((node) => [node.type.name, node] as const))('keeps Shift-Enter inside the text in %s', (_name, block) => {
    const state = atText(editor(block), block.type.name === 'table' ? 'A' : 'Body')
    const result = run(buildKeymap(schema)['Shift-Enter'], state)
    expect(result.handled).toBe(true)
    expect(result.state.doc.childCount).toBe(1)
    expect(result.state.selection.$from.depth).toBe(state.selection.$from.depth)
    if (block.type.spec.code) expect(result.state.selection.$from.parent.textContent).toBe('Body\n')
    else expect(result.state.selection.$from.parent.lastChild?.type.name).toBe('hard_break')
  })

  it.each(
    wrappers.map((node) => [node.type.name, node] as const),
  )('exits %s without splitting it, and undoes independently', (_name, block) => {
    let state = atText(editor(block), block.type.name === 'table' ? 'A' : 'Body')
    state = state.apply(state.tr.insertText('!'))
    const before = state.doc
    const result = run(buildKeymap(schema)['Mod-Enter'], state)
    expect(result.handled).toBe(true)
    expect(result.state.doc.childCount).toBe(2)
    expect(result.state.doc.child(0).eq(before.child(0))).toBe(true)
    expect(result.state.selection.from).toBe(before.content.size + 1)
    expect(result.state.selection.$from.parent.type.name).toBe('paragraph')
    expect(deserialize(schema, serialize(result.state.doc)).eq(result.state.doc)).toBe(true)
    expect(run(undo, result.state).state.doc.eq(before)).toBe(true)
  })

  it('reuses a following paragraph without recording a document edit', () => {
    let state = atText(editor(table(), paragraph('Existing')), 'A')
    state = state.apply(closeHistory(state.tr.insertText('!')))
    const result = run(continueAfterBlock, state)
    expect(result.handled).toBe(true)
    expect(result.state.doc).toBe(state.doc)
    expect(result.state.selection.from).toBe(state.doc.child(0).nodeSize + 1)
    expect(run(undo, result.state).state.doc.childCount).toBe(2)
    expect(run(undo, result.state).state.doc.textContent).not.toContain('!')
  })

  it('leaves a nested table inside its callout, then exits the callout on the next request', () => {
    const callout = schema.nodes.callout.create(null, [table(), schema.nodes.code_block.create(null, schema.text('next'))])
    const state = atText(editor(callout), 'B')
    const first = run(continueAfterBlock, state).state
    expect(first.doc.childCount).toBe(1)
    expect(first.doc.child(0).childCount).toBe(3)
    expect(first.doc.child(0).child(1).type.name).toBe('paragraph')
    expect(first.doc.child(0).child(2).textContent).toBe('next')
    const second = run(continueAfterBlock, first).state
    expect(second.doc.childCount).toBe(2)
    expect(second.selection.$from.depth).toBe(1)
  })

  it('supports table cell selection and selected leaf blocks without replacing their content', () => {
    let state = editor(table())
    state = state.apply(state.tr.setSelection(CellSelection.create(state.doc, 2)))
    expect(run(continueAfterBlock, state).state.doc.child(0).eq(state.doc.child(0))).toBe(true)
    state = editor(schema.nodes.horizontal_rule.create())
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 0)))
    expect(run(continueAfterBlock, state).state.doc.childCount).toBe(2)
    expect(run(exitBlockDown, state).state.doc.childCount).toBe(2)
  })

  it('continues after the last selected block', () => {
    let state = editor(table(), paragraph('Selected'), paragraph('Next'))
    const end = state.doc.child(0).nodeSize + state.doc.child(1).nodeSize
    state = state.apply(state.tr.setSelection(BlockSelection.create(state.doc, 0, end)))
    const result = run(continueAfterBlock, state)
    expect(result.state.doc).toBe(state.doc)
    expect(result.state.selection.from).toBe(end + 1)
  })

  it.each(['readonly', 'interactive'] as const)('refuses structural edits in %s mode', (mode) => {
    const state = atText(EditorState.create({ doc: editor(table()).doc, plugins: [modePlugin(mode)] }), 'D')
    for (const command of [continueAfterBlock, exitBlockDown, buildKeymap(schema)['Mod-Enter']]) {
      expect(run(command, state).handled).toBe(false)
    }
  })
})

describe('Down at the lower boundary', () => {
  it('leaves both bottom-row cells but keeps navigation inside earlier rows', () => {
    const state = editor(table())
    for (const text of ['A', 'B']) expect(run(exitBlockDown, atText(state, text)).handled).toBe(false)
    for (const text of ['C', 'D']) {
      const result = run(exitBlockDown, atText(state, text))
      expect(result.handled).toBe(true)
      expect(result.state.selection.$from.depth).toBe(1)
    }
    expect(run(exitBlockDown, atText(state, 'D'), false).handled).toBe(false)
  })

  it('recognizes a bottom cell that spans rows', () => {
    const spanning = schema.nodes.table.create(null, [row(cell('Tall', { rowspan: 2 }), cell('Top')), row(cell('Bottom'))])
    const result = run(exitBlockDown, atText(editor(spanning), 'Tall'))
    expect(result.handled).toBe(true)
    expect(result.state.doc.childCount).toBe(2)
  })

  it('requires the last paragraph in a cell and the last child of a container', () => {
    const grid = schema.nodes.table.create(null, row(schema.nodes.table_cell.create(null, [paragraph('First'), paragraph('Last')])))
    for (const block of [grid, schema.nodes.blockquote.create(null, [paragraph('First'), paragraph('Last')])]) {
      const state = editor(block)
      expect(run(exitBlockDown, atText(state, 'First')).handled).toBe(false)
      expect(run(exitBlockDown, atText(state, 'Last')).handled).toBe(true)
    }
  })

  it('does not insert between existing non-paragraph blocks or extend ordinary paragraphs', () => {
    expect(run(exitBlockDown, atText(editor(table(), schema.nodes.code_block.create(null, schema.text('Next'))), 'D')).handled).toBe(false)
    expect(run(exitBlockDown, atText(editor(paragraph('Plain')), 'Plain')).handled).toBe(false)
    let state = atText(editor(table()), 'D')
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, state.selection.from - 1, state.selection.from)))
    expect(run(exitBlockDown, state).handled).toBe(false)
  })
})
