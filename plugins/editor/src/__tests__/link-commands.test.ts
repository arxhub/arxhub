import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { modePlugin } from '../editor-mode'
import { schema } from '../editor-schema'
import { linkAtSelection, safeLink, setLink } from '../link-commands'

const textDoc = schema.node('doc', null, schema.node('paragraph', null, schema.text('Useful words')))

describe('document links', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,hello',
    'vbscript:alert(1)',
    'java\nscript:alert(1)',
  ])('does not render an executable URL: %s', (href) => {
    expect(safeLink(href)).toBeNull()
    const mark = schema.marks.link.create({ href })
    expect(schema.marks.link.spec.toDOM?.(mark, false)).toEqual(['a', { href: null, title: null, rel: 'noopener noreferrer' }, 0])
  })

  it('applies a link to selected words and removes it without deleting text', () => {
    let state = EditorState.create({ doc: textDoc, selection: TextSelection.create(textDoc, 1, 7) })
    setLink('https://example.com')(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.textContent).toBe('Useful words')
    expect(state.doc.firstChild?.firstChild?.marks[0].attrs.href).toBe('https://example.com')
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)))
    expect(linkAtSelection(state)).toEqual({ from: 1, to: 7, href: 'https://example.com' })
    setLink(null)(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.eq(textDoc)).toBe(true)
  })

  it('edits one entire link across formatting boundaries without changing another link', () => {
    const link = schema.marks.link.create({ href: 'https://example.com' })
    const doc = schema.node(
      'doc',
      null,
      schema.node('paragraph', null, [
        schema.text('one', [link]),
        schema.text('two', [link, schema.marks.strong.create()]),
        schema.text(' gap '),
        schema.text('other', [link]),
      ]),
    )
    let state = EditorState.create({ doc, selection: TextSelection.create(doc, 5) })
    expect(linkAtSelection(state)).toEqual({ from: 1, to: 7, href: 'https://example.com' })
    setLink('https://changed.example')(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.firstChild?.lastChild?.marks[0].attrs.href).toBe('https://example.com')
  })

  it('inserts an address at an empty caret and refuses changes outside editable', () => {
    let state = EditorState.create({ schema })
    setLink('mailto:test@example.com')(state, (tr) => {
      state = state.apply(tr)
    })
    expect(state.doc.textContent).toBe('mailto:test@example.com')
    const readonly = EditorState.create({ doc: textDoc, plugins: [modePlugin('readonly')] })
    expect(setLink('https://example.com')(readonly)).toBe(false)
  })
})
