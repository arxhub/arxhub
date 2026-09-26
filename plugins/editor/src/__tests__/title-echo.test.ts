import type { Node } from 'prosemirror-model'
import { EditorState, NodeSelection, Selection, TextSelection, type Transaction } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { documentHeadings, documentSearchKey, documentSearchPlugin } from '../document-search'
import { serialize } from '../editor-format'
import { schema } from '../editor-schema'
import { echoesName, renameTitleEcho, selectionAfterEcho, titleEcho, titleEchoKey, titleEchoRange } from '../title-echo'

const heading = (text: string, level = 1) => schema.node('heading', { level }, text ? schema.text(text) : undefined)
const paragraph = (text: string) => schema.node('paragraph', null, text ? schema.text(text) : undefined)
const doc = (...blocks: Node[]) => schema.node('doc', null, blocks)

function open(content: Node, name: string): EditorState {
  return EditorState.create({
    doc: content,
    plugins: [titleEcho(name), documentSearchPlugin(() => {})],
    selection: selectionAfterEcho(content, name),
  })
}
function run(state: EditorState, build: (tr: Transaction) => Transaction): EditorState {
  return state.applyTransaction(build(state.tr)).state
}
const hidden = (state: EditorState) => titleEchoKey.getState(state)?.hidden

describe('title echo', () => {
  it('matches the name after whitespace normalization, never across case or level', () => {
    expect(echoesName(doc(heading('  Plan \n next '), paragraph('x')), 'Plan next')).toBe(true)
    expect(echoesName(doc(heading('Café'), paragraph('x')), 'Café')).toBe(true)
    expect(echoesName(doc(heading('plan'), paragraph('x')), 'Plan')).toBe(false)
    expect(echoesName(doc(heading('Plan', 2), paragraph('x')), 'Plan')).toBe(false)
    expect(echoesName(doc(heading(''), paragraph('x')), '')).toBe(false)
  })

  it('counts only the first block', () => {
    expect(echoesName(doc(paragraph('intro'), heading('Plan'), paragraph('x')), 'Plan')).toBe(false)
  })

  it('does not hide a heading that is the only block', () => {
    expect(hidden(open(doc(heading('Plan')), 'Plan'))).toBe(false)
  })

  it('hides on load and names the hidden range', () => {
    const state = open(doc(heading('Plan'), paragraph('body')), 'Plan')
    expect(hidden(state)).toBe(true)
    expect(titleEchoRange(state)).toEqual({ from: 0, to: 6 })
  })

  it('hides and shows again on a rename', () => {
    let state = open(doc(heading('Plan'), paragraph('body')), 'Other')
    expect(hidden(state)).toBe(false)
    state = run(state, (tr) => renameTitleEcho(tr, 'Plan'))
    expect(hidden(state)).toBe(true)
    state = run(state, (tr) => renameTitleEcho(tr, 'Later'))
    expect(hidden(state)).toBe(false)
  })

  it('reveals the heading once an edit breaks the match, and keeps it shown when it matches again', () => {
    let state = open(doc(heading('Plan'), paragraph('body')), 'Plan')
    state = run(state, (tr) => tr.insertText('s', 5))
    expect(state.doc.firstChild?.textContent).toBe('Plans')
    expect(hidden(state)).toBe(false)
    state = run(state, (tr) => tr.delete(5, 6))
    expect(state.doc.firstChild?.textContent).toBe('Plan')
    expect(hidden(state)).toBe(false)
  })

  it('stays hidden while the rest of the document is edited', () => {
    let state = open(doc(heading('Plan'), paragraph('body')), 'Plan')
    state = run(state, (tr) => tr.insertText('more ', 7))
    expect(hidden(state)).toBe(true)
  })

  it('reveals when everything after it is gone', () => {
    let state = open(doc(heading('Plan'), paragraph('body')), 'Plan')
    state = run(state, (tr) => tr.delete(6, state.doc.content.size))
    expect(hidden(state)).toBe(false)
  })

  it('starts the caret after the hidden heading', () => {
    const content = doc(heading('Plan'), paragraph('body'))
    expect(selectionAfterEcho(content, 'Plan')?.from).toBe(7)
    expect(selectionAfterEcho(content, 'Other')).toBeUndefined()
    expect(open(content, 'Plan').selection.from).toBe(7)
  })

  it('moves a caret that lands in the hidden heading out of it', () => {
    let state = open(doc(heading('Plan'), paragraph('body')), 'Plan')
    // What ArrowUp from the paragraph resolves to: the nearest position in the block above.
    state = run(state, (tr) => tr.setSelection(Selection.near(state.doc.resolve(5), -1)))
    expect(state.selection.from).toBe(7)
    state = run(state, (tr) => tr.setSelection(NodeSelection.create(state.doc, 0)))
    expect(state.selection).toBeInstanceOf(TextSelection)
    expect(state.selection.from).toBe(7)
  })

  it('trims a range reaching into the hidden heading to what is visible', () => {
    let state = open(doc(heading('Plan'), paragraph('body')), 'Plan')
    state = run(state, (tr) => tr.setSelection(TextSelection.create(state.doc, 11, 2)))
    expect([state.selection.anchor, state.selection.head]).toEqual([11, 7])
  })

  it('leaves the caret alone while the heading is shown', () => {
    let state = open(doc(heading('Other'), paragraph('body')), 'Plan')
    state = run(state, (tr) => tr.setSelection(TextSelection.create(state.doc, 2)))
    expect(state.selection.from).toBe(2)
  })

  it('never changes what is saved', () => {
    const content = doc(heading('Plan'), paragraph('body'))
    const plain = EditorState.create({ doc: content })
    const echoed = open(content, 'Plan')
    expect(serialize(echoed.doc)).toBe(serialize(plain.doc))
  })

  it('keeps the hidden heading out of find and the outline', () => {
    let state = open(doc(heading('Plan'), paragraph('Plan body'), heading('Plan', 2)), 'Plan')
    state = run(state, (tr) => tr.setMeta(documentSearchKey, { query: 'Plan' }))
    expect(documentSearchKey.getState(state)?.matches.map((match) => match.from)).toEqual([7, 18])
    expect(documentHeadings(state.doc, titleEchoRange(state)).map((entry) => entry.pos)).toEqual([18])
    state = run(state, (tr) => renameTitleEcho(tr, 'Other'))
    expect(documentSearchKey.getState(state)?.matches).toHaveLength(3)
  })
})
