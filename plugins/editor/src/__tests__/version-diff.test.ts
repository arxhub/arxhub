import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { identityNodes } from '../block-identity'
import { schema as base } from '../editor-schema'
import { restoreVersionBlock, versionDifferences } from '../version-diff'

const schema = new Schema({ nodes: identityNodes(base.spec.nodes), marks: base.spec.marks })
const block = (id: string, text = id) => schema.node('paragraph', { arxId: id }, schema.text(text))
const doc = (...blocks: ReturnType<typeof block>[]) => schema.node('doc', null, blocks)

describe('block version comparison', () => {
  it('does not count ordinal shifts from insertion as block moves', () => {
    expect(versionDifferences(doc(block('new'), block('a'), block('b')), doc(block('a'), block('b'))).map((change) => change.kind)).toEqual([
      'added',
    ])
  })
  it('restores changed and removed blocks while keeping unrelated new content', () => {
    const previous = doc(block('a'), block('b'))
    let state = EditorState.create({ doc: doc(block('a', 'edited'), block('new')) })
    state = state.apply(restoreVersionBlock(state, previous, 'before:a'))
    expect(state.doc.textContent).toBe('anew')
    state = state.apply(restoreVersionBlock(state, previous, 'before:b'))
    expect(state.doc.textContent).toBe('anewb')
  })
  it('restores order of a moved block without dropping another block', () => {
    const previous = doc(block('a'), block('b'), block('c'))
    let state = EditorState.create({ doc: doc(block('b'), block('a'), block('c')) })
    const changes = versionDifferences(state.doc, previous)
    expect(changes).toHaveLength(1)
    expect(changes[0].kind).toBe('moved')
    state = state.apply(restoreVersionBlock(state, previous, changes[0].key))
    expect(state.doc.textContent).toBe('abc')
  })
})
