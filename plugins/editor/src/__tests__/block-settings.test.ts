import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { describe, expect, it } from 'vitest'
import { identifyBlocks, identityNodes } from '../block-identity'
import { blockTarget, changeInspectedBlock, inspect, inspectorKey, inspectorPlugin, runInspectedCommand, settingsAt } from '../block-settings'
import { arrangeColumns } from '../columns'
import { modePlugin } from '../editor-mode'
import { schema as base } from '../editor-schema'

const schema = new Schema({ nodes: identityNodes(base.spec.nodes), marks: base.spec.marks })
const p = (text: string) => schema.nodes.paragraph.create(null, schema.text(text))
function editor(nodes: ReturnType<typeof p>[], mode: 'editable' | 'interactive' | 'readonly' = 'editable') {
  let state = EditorState.create({
    schema,
    doc: identifyBlocks(schema.nodes.doc.create(null, nodes)),
    plugins: [modePlugin(mode), inspectorPlugin()],
  })
  return {
    get state() {
      return state
    },
    isDestroyed: false,
    dispatch(tr: Parameters<EditorState['apply']>[0]) {
      state = state.apply(tr)
    },
  } as EditorView
}

describe('pinned block settings', () => {
  it('does not follow the caret and maps the chosen block through insertions and moves', () => {
    const view = editor([schema.nodes.callout.create(null, p('Target')), p('Elsewhere')])
    inspect(view, blockTarget(view.state.doc, 0))
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.doc.content.size - 2)))
    changeInspectedBlock(view, { type: 'warning' })
    expect(view.state.doc.firstChild?.attrs.type).toBe('warning')
    view.dispatch(view.state.tr.insert(0, p('Before')))
    const target = inspectorKey.getState(view.state)
    expect(target).toMatchObject({ kind: 'block', pos: p('Before').nodeSize })
    if (target?.kind !== 'block') throw new Error('Expected block')
    const node = view.state.doc.nodeAt(target.pos)
    if (!node) throw new Error('Expected node')
    const tr = view.state.tr.delete(target.pos, target.pos + node.nodeSize)
    tr.insert(tr.doc.content.size, node)
    view.dispatch(tr)
    changeInspectedBlock(view, { type: 'success' })
    expect(view.state.doc.lastChild?.attrs.type).toBe('success')
    const last = inspectorKey.getState(view.state)
    if (last?.kind !== 'block') throw new Error('Expected block')
    view.dispatch(view.state.tr.delete(last.pos, last.pos + node.nodeSize))
    expect(inspectorKey.getState(view.state)).toBeNull()
  })
  it('targets a containing columns block and preserves its identity when changing column count', () => {
    const columns = schema.nodes.columns.create(null, [
      schema.nodes.column.create(null, p('Left')),
      schema.nodes.column.create(null, p('Right')),
    ])
    const view = editor([columns, p('Elsewhere')])
    expect(settingsAt(view.state, 3)).toBe(0)
    inspect(view, blockTarget(view.state.doc, 0))
    const id = view.state.doc.firstChild?.attrs.arxId
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.doc.content.size - 2)))
    runInspectedCommand(view, arrangeColumns(3))
    expect(view.state.doc.firstChild?.childCount).toBe(3)
    expect(view.state.doc.firstChild?.attrs.arxId).toBe(id)
    expect(inspectorKey.getState(view.state)).toMatchObject({ id, pos: 0 })
    expect(view.state.doc.lastChild?.textContent).toBe('Elsewhere')
  })
  it('does not redirect a delayed change to a newly selected block, or a replacement at the same position', () => {
    const view = editor([schema.nodes.select.create(), schema.nodes.select.create()])
    const original = blockTarget(view.state.doc, 0)
    inspect(view, blockTarget(view.state.doc, 1))
    changeInspectedBlock(view, { label: 'Original' }, original)
    expect(view.state.doc.firstChild?.attrs.label).toBe('Original')
    expect(view.state.doc.lastChild?.attrs.label).toBe('Status')
    view.dispatch(view.state.tr.delete(0, 1))
    changeInspectedBlock(view, { label: 'Wrong' }, original)
    expect(view.state.doc.firstChild?.attrs.label).toBe('Status')
  })
  it.each(['interactive', 'readonly'] as const)('protects configuration in %s mode', (mode) => {
    const view = editor([schema.nodes.select.create()], mode)
    inspect(view, blockTarget(view.state.doc, 0))
    changeInspectedBlock(view, { label: 'Changed' })
    expect(view.state.doc.firstChild?.attrs.label).toBe('Status')
  })
  it('opening properties changes no document data', () => {
    const view = editor([p('Body')])
    const before = view.state.doc
    inspect(view, { kind: 'page' })
    expect(view.state.doc).toBe(before)
    expect(inspectorKey.getState(view.state)).toEqual({ kind: 'page' })
  })
})
