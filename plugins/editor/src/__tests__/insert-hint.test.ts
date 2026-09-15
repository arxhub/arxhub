import { EditorState, TextSelection } from 'prosemirror-state'
import type { DecorationSet } from 'prosemirror-view'
import { describe, expect, it } from 'vitest'
import { type EditorMode, modePlugin } from '../editor-mode'
import { schema } from '../editor-schema'
import { INSERT_HINT, insertHint } from '../insert-hint'

const paragraph = (text?: string) => schema.nodes.paragraph.create(null, text ? schema.text(text) : null)
const doc = schema.nodes.doc.create(null, [
  paragraph('Some text'),
  paragraph(),
  schema.nodes.task_list.create(null, schema.nodes.task_item.create(null, paragraph())),
])
// paragraph("Some text") spans 0..11, the empty paragraph 11..13, the task's paragraph starts at 15.
const emptyParagraph = { from: 11, to: 13 }
const taskParagraph = { from: 15, to: 17 }

function hints(mode: EditorMode, cursor: number): { from: number; to: number; text: unknown }[] {
  const plugin = insertHint()
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, cursor), plugins: [modePlugin(mode), plugin] })
  const set = plugin.props.decorations?.call(plugin, state) as DecorationSet | null | undefined
  return (set?.find() ?? []).map((decoration) => ({ from: decoration.from, to: decoration.to, text: decoration.spec.placeholder }))
}

describe('insert hint', () => {
  it('marks the empty paragraph holding the caret, and only that one', () => {
    expect(hints('editable', 12)).toEqual([{ ...emptyParagraph, text: INSERT_HINT }])
    expect(hints('editable', 16)).toEqual([{ ...taskParagraph, text: INSERT_HINT }])
  })

  it('shows nothing for a paragraph with text, and nothing outside editable', () => {
    expect(hints('editable', 5)).toEqual([])
    expect(hints('interactive', 12)).toEqual([])
    expect(hints('readonly', 12)).toEqual([])
  })

  it('is a node decoration carrying the hint as an attribute the stylesheet can draw', () => {
    const plugin = insertHint('Start here')
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 12), plugins: [modePlugin('editable'), plugin] })
    const set = plugin.props.decorations?.call(plugin, state) as DecorationSet
    const [decoration] = set.find()
    expect(decoration.inline).toBe(false)
    expect(decoration.spec.placeholder).toBe('Start here')
  })
})
