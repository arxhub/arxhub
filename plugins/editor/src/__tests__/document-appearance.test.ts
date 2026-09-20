import { history, undo } from 'prosemirror-history'
import { EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { expect, test } from 'vitest'
import { mergeArx } from '../arx-merge'
import { changeAppearance, documentAppearance, parseAppearance } from '../document-appearance'
import { deserialize, serialize } from '../editor-format'
import { modePlugin } from '../editor-mode'
import { schema } from '../editor-schema'

const document = (icon: string | null, text = 'body') =>
  JSON.stringify({
    version: 1,
    appearance: { icon, cover: null },
    untouched: { nested: true },
    doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  })

test('appearance is undoable and round-trips without becoming a body heading or dropping metadata', () => {
  let state = EditorState.create({ schema, doc: deserialize(schema, document(null)), plugins: [modePlugin('editable'), history()] })
  const view = {
    get state() {
      return state
    },
    isDestroyed: false,
    dispatch: (tr: EditorState['tr']) => {
      state = state.apply(tr)
    },
  } as EditorView
  changeAppearance(view, { icon: 'lu:star', cover: { path: 'attachments/cover.png', name: 'cover.png', mime: 'image/png', size: 123 } })
  const raw = serialize(state.doc)
  expect(JSON.parse(raw).untouched).toEqual({ nested: true })
  expect(documentAppearance(deserialize(schema, raw)).icon).toBe('lu:star')
  expect(state.doc.childCount).toBe(1)
  expect(state.doc.textContent).toBe('body')
  expect(undo(state, view.dispatch)).toBe(true)
  expect(documentAppearance(state.doc).icon).toBeNull()
})

test('read-only and interactive documents reject appearance edits; remote images and malformed assets are refused', () => {
  for (const mode of ['readonly', 'interactive'] as const) {
    let state = EditorState.create({ schema, doc: deserialize(schema, document(null)), plugins: [modePlugin(mode)] })
    const view = {
      get state() {
        return state
      },
      isDestroyed: false,
      dispatch: (tr: EditorState['tr']) => {
        state = state.apply(tr)
      },
    } as EditorView
    changeAppearance(view, { icon: 'lu:star', cover: null })
    expect(documentAppearance(state.doc).icon).toBeNull()
  }
  expect(() => parseAppearance({ cover: { path: 'https://example.com/a.png', name: 'a', mime: 'image/png', size: 1 } })).toThrow()
  expect(() => parseAppearance({ cover: { path: 'attachments/a.svg', name: 'a', mime: 'image/svg+xml', size: 1 } })).toThrow()
})

test('sync combines a page icon edit with a body edit and refuses competing icon values', () => {
  const base = document(null)
  const local = document('lu:star')
  const remote = document(null, 'remote body')
  const result = JSON.parse(mergeArx(base, local, remote).merged)
  expect(result.appearance.icon).toBe('lu:star')
  expect(result.doc.content[0].content[0].text).toBe('remote body')
  expect(() => mergeArx(base, local, document('lu:heart'))).toThrow('Conflicting document metadata')
})
