import { Schema } from 'prosemirror-model'
import { describe, expect, it } from 'vitest'
import { identityNodes } from '../block-identity'
import { documentBlocks, documentHref, documentTarget, revealBlock } from '../document-links'
import { schema } from '../editor-schema'

// `editor-schema.ts`'s own schema carries no `arxId` attribute — that comes from `identityNodes`,
// applied once over the composed schema in `editor-extension.ts`. A test that wants a block id has to
// build a schema the same way, or the attribute is silently dropped and `node.attrs.arxId` reads
// `undefined` for every node.
const idSchema = new Schema({ nodes: identityNodes(schema.spec.nodes), marks: schema.spec.marks })

describe('document destinations', () => {
  it('roundtrips names and anchors without confusing path separators or fragments', () => {
    const path = 'notes/План #1?.arx'
    const anchor = { text: 'Что & почему?', skip: 2 }
    expect(documentTarget('other/source.arx', documentHref(path, anchor))).toEqual({ path, anchor })
    expect(documentTarget('notes/source.arx', '../target.arx')).toEqual({ path: 'target.arx' })
    expect(documentTarget('notes/source.arx', '#Summary')).toEqual({ path: 'notes/source.arx', anchor: { text: 'Summary' } })
    expect(documentTarget('notes/source.arx', '../../outside.arx')).toBeNull()
    expect(documentTarget('notes/source.arx', 'https://other.test/a.arx')).toBeNull()
    expect(documentTarget('notes/source.arx', '//other.test/a.arx')).toBeNull()
    expect(documentTarget('notes/source.arx', '/%00.arx')).toBeNull()
  })

  it('distinguishes repeated block text and survives inserting a preceding paragraph', () => {
    const paragraph = (text: string) => schema.node('paragraph', null, schema.text(text))
    const doc = schema.node('doc', null, [paragraph('Repeated'), paragraph('Repeated')])
    const blocks = documentBlocks(doc)
    expect(blocks[1].anchor).toEqual({ text: 'Repeated', skip: 1 })
    expect(revealBlock(doc, blocks[1].anchor)?.from).toBe(11)
    const changed = schema.node('doc', null, [paragraph('Inserted'), paragraph('Repeated'), paragraph('Repeated')])
    expect(revealBlock(changed, blocks[1].anchor)?.from).toBe(21)
    expect(revealBlock(changed, { text: 'Missing' })).toBeNull()
  })

  it('jumps straight to a block by id, ahead of any text match', () => {
    const doc = idSchema.node('doc', null, [
      idSchema.node('paragraph', { arxId: 'a1' }, idSchema.text('First')),
      idSchema.node('paragraph', { arxId: 'a2' }, idSchema.text('Second')),
    ])
    // Text alone would land on the first paragraph; the id names the second one precisely.
    expect(revealBlock(doc, { text: 'irrelevant', blockId: 'a2' })?.from).toBe(8)
  })

  it('falls back to the text when the named block was deleted since the anchor was made', () => {
    const paragraph = (text: string, id?: string) => idSchema.node('paragraph', id ? { arxId: id } : null, idSchema.text(text))
    const doc = idSchema.node('doc', null, [paragraph('Gone', 'was-here'), paragraph('Target text')])
    expect(revealBlock(doc, { text: 'Target text', blockId: 'no-longer-there' })?.from).toBe(7)
  })
})
