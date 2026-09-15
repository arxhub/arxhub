import { history, undo } from 'prosemirror-history'
import { type DOMOutputSpec, Schema } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { blockIdentityPlugin, identifyBlocks, identityNodes } from '../block-identity'
import { documentBlocks, documentHref, documentTarget, revealBlock } from '../document-links'
import { deserialize, serialize } from '../editor-format'
import { schema as baseSchema } from '../editor-schema'

const schema = new Schema({ nodes: identityNodes(baseSchema.spec.nodes), marks: baseSchema.spec.marks })
const doc = () => identifyBlocks(schema.node('doc', null, [schema.node('paragraph', null, schema.text('Original'))]))

describe('stable block identities', () => {
  it('does not turn an attribute array into a trusted DOM spec when adding an identity', () => {
    const unsafe = new Schema({
      nodes: identityNodes(
        baseSchema.spec.nodes.append({
          widget: { group: 'block', atom: true, attrs: { layout: {} }, toDOM: (node) => node.attrs.layout as DOMOutputSpec },
        }),
      ),
      marks: baseSchema.spec.marks,
    })
    const node = unsafe.node('widget', { arxId: 'widget', layout: ['img', { src: 'x', onerror: 'untrusted()' }] })
    expect(() => node.type.spec.toDOM?.(node)).toThrow('cannot come from document attributes')
  })

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

  it('resolves an edited block by identity, ahead of its now-stale text', () => {
    let state = EditorState.create({ doc: doc(), plugins: [blockIdentityPlugin()] })
    const anchor = documentBlocks(state.doc)[0].anchor
    state = state.applyTransaction(state.tr.insertText('Updated', 1, 9)).state
    expect(revealBlock(state.doc, anchor)?.from).toBe(1)
    expect(state.doc.textContent).toBe('Updated')
    expect(documentTarget('source.arx', documentHref('target.arx', anchor))?.anchor).toEqual(anchor)
    expect(deserialize(schema, serialize(state.doc)).eq(state.doc)).toBe(true)
  })

  // The id names a block that used to exist and no longer does — the document was reloaded, or the
  // block a search hit came from was deleted since the index last saw it. Rather than reporting no
  // place at all, the anchor's own text is still worth a look: it survives exactly the edits that cost
  // the id its block.
  it('falls back to the anchor text once the named id is nowhere in the document', () => {
    const anchor = documentBlocks(doc())[0].anchor
    const reloaded = doc()
    expect(revealBlock(reloaded, anchor)?.from).toBe(1)
    expect(revealBlock(reloaded, { ...anchor, text: 'Nothing like it' })).toBeNull()
  })
})
