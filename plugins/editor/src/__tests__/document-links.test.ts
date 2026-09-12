import { describe, expect, it } from 'vitest'
import { documentBlocks, documentHref, documentTarget, revealBlock } from '../document-links'
import { schema } from '../editor-schema'

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
})
