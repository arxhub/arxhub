import { history, undo } from 'prosemirror-history'
import { EditorState } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { documentHeadings, documentSearchKey, documentSearchPlugin, findDocumentMatches, replaceDocumentMatch } from '../document-search'
import { modePlugin } from '../editor-mode'
import { schema } from '../editor-schema'

describe('document search', () => {
  it('matches literal Unicode text across marks with exact document offsets', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('Пр'), schema.text('ивет [x]', [schema.marks.strong.create()])]),
      schema.node('paragraph', null, schema.text('привет')),
    ])
    expect(findDocumentMatches(doc, 'привет')).toEqual([
      { from: 1, to: 7 },
      { from: 13, to: 19 },
    ])
    expect(findDocumentMatches(doc, 'привет', true)).toEqual([{ from: 13, to: 19 }])
    expect(findDocumentMatches(doc, '[x]')).toEqual([{ from: 8, to: 11 }])
    expect(findDocumentMatches(doc, '')).toEqual([])
  })

  it('replaces all from the end, preserves other marks and undoes as one operation', () => {
    const doc = schema.node(
      'doc',
      null,
      schema.node('paragraph', null, [schema.text('cat cat '), schema.text('keep', [schema.marks.strong.create()])]),
    )
    let state = EditorState.create({ doc, plugins: [modePlugin('editable'), documentSearchPlugin(() => {}), history()] })
    state = state.apply(state.tr.setMeta(documentSearchKey, { query: 'cat' }))
    replaceDocumentMatch('elephant', true)(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.textContent).toBe('elephant elephant keep')
    expect(state.doc.firstChild?.lastChild?.marks[0].type.name).toBe('strong')
    expect(documentSearchKey.getState(state)?.matches).toEqual([])
    undo(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.eq(doc)).toBe(true)
    expect(documentSearchKey.getState(state)?.matches).toHaveLength(2)
  })

  it.each(['readonly', 'interactive'] as const)('allows search but refuses replacement in %s', (mode) => {
    let state = EditorState.create({
      doc: schema.node('doc', null, schema.node('paragraph', null, schema.text('cat'))),
      plugins: [modePlugin(mode), documentSearchPlugin(() => {})],
    })
    state = state.apply(state.tr.setMeta(documentSearchKey, { query: 'cat' }))
    expect(documentSearchKey.getState(state)?.matches).toHaveLength(1)
    expect(replaceDocumentMatch('dog')(state)).toBe(false)
  })

  it('builds heading positions through nested blocks', () => {
    const doc = schema.node('doc', null, [
      schema.node('heading', { level: 1 }, schema.text('Top')),
      schema.node('blockquote', null, schema.node('heading', { level: 3 }, schema.text('Nested'))),
    ])
    expect(documentHeadings(doc)).toEqual([
      { pos: 1, level: 1, title: 'Top' },
      { pos: 7, level: 3, title: 'Nested' },
    ])
  })
})
