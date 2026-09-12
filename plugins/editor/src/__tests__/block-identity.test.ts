import { history, undo } from 'prosemirror-history'
import { Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { blockIdentityPlugin, identifyBlocks, identityNodes } from '../block-identity'
import { documentBlocks, documentHref, documentTarget, revealBlock } from '../document-links'
import { deserialize, serialize } from '../editor-format'
import { schema as baseSchema } from '../editor-schema'

const schema = new Schema({ nodes: identityNodes(baseSchema.spec.nodes), marks: baseSchema.spec.marks })
const doc = () => identifyBlocks(schema.node('doc', null, [schema.node('paragraph', null, schema.text('Original'))]))

describe('stable block identities', () => {
  it('keeps the original identity when a copy is inserted before it and undo restores the original', () => {
    let state = EditorState.create({ doc: doc(), plugins: [history(), blockIdentityPlugin()] })
    const original = state.doc.firstChild!
    state = state.applyTransaction(state.tr.insert(0, original)).state
    expect(state.doc.child(1).attrs.arxId).toBe(original.attrs.arxId)
    expect(state.doc.child(0).attrs.arxId).not.toBe(original.attrs.arxId)
    undo(state, (tr) => {
      state = state.applyTransaction(tr).state
    })
    expect(state.doc.childCount).toBe(1)
    expect(state.doc.firstChild?.attrs.arxId).toBe(original.attrs.arxId)
  })

  it('resolves an edited block by identity and does not jump to matching text when that block is deleted', () => {
    let state = EditorState.create({ doc: doc(), plugins: [blockIdentityPlugin()] })
    const anchor = documentBlocks(state.doc)[0].anchor
    state = state.applyTransaction(state.tr.insertText('Updated', 1, 9)).state
    expect(revealBlock(state.doc, anchor)?.from).toBe(1)
    expect(state.doc.textContent).toBe('Updated')
    expect(documentTarget('source.arx', documentHref('target.arx', anchor))?.anchor).toEqual(anchor)
    const different = doc()
    expect(revealBlock(different, anchor)).toBeNull()
    expect(deserialize(schema, serialize(state.doc)).eq(state.doc)).toBe(true)
  })
})
