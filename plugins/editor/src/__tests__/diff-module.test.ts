import { Schema } from 'prosemirror-model'
import { describe, expect, it } from 'vitest'
import { identityNodes } from '../block-identity'
import { diffLines, diffNodes, diffTexts } from '../diff-module'
import { schema as base } from '../editor-schema'

const schema = new Schema({ nodes: identityNodes(base.spec.nodes), marks: base.spec.marks })
const block = (id: string, text = id) => schema.node('paragraph', { arxId: id }, schema.text(text))
const doc = (...blocks: ReturnType<typeof block>[]) => schema.node('doc', null, blocks)

describe('diffLines', () => {
  it('marks equal, added and removed lines', () => {
    expect(diffLines('a\nb\n', 'a\nc\n')).toEqual([
      { type: 'equal', text: 'a' },
      { type: 'removed', text: 'b' },
      { type: 'added', text: 'c' },
      { type: 'equal', text: '' },
    ])
  })
})

describe('diffTexts', () => {
  it('returns a line diff for plain text', () => {
    const result = diffTexts({
      left: 'hello\n',
      right: 'world\n',
      pathname: 'note.md',
      leftLabel: 'Saved version',
      rightLabel: 'Current',
    })
    expect(result.kind).toBe('lines')
    expect(result.leftLabel).toBe('Saved version')
    expect(result.rightLabel).toBe('Current')
    expect(result.lines?.some((l) => l.type === 'removed' && l.text === 'hello')).toBe(true)
    expect(result.lines?.some((l) => l.type === 'added' && l.text === 'world')).toBe(true)
  })

  it('returns replaced for binary / NUL content', () => {
    const left = new Uint8Array([0x00, 0x01, 0x02])
    const right = new Uint8Array([0xff, 0xfe])
    const result = diffTexts({
      left,
      right,
      pathname: 'blob.bin',
      leftLabel: 'A',
      rightLabel: 'B',
    })
    expect(result.kind).toBe('replaced')
    expect(result.leftBytes).toBe(3)
    expect(result.rightBytes).toBe(2)
  })

  it('uses block diff for .arx when a schema is provided', () => {
    const left = JSON.stringify({
      version: 1,
      doc: { type: 'doc', content: [{ type: 'paragraph', attrs: { arxId: 'a' }, content: [{ type: 'text', text: 'old' }] }] },
    })
    const right = JSON.stringify({
      version: 1,
      doc: { type: 'doc', content: [{ type: 'paragraph', attrs: { arxId: 'a' }, content: [{ type: 'text', text: 'new' }] }] },
    })
    const result = diffTexts({
      left,
      right,
      pathname: 'note.arx',
      leftLabel: 'Saved version',
      rightLabel: 'Current',
      schema,
    })
    expect(result.kind).toBe('blocks')
    expect(result.blocks?.some((b) => b.kind === 'changed')).toBe(true)
  })

  it('falls back to lines for .arx without a schema', () => {
    const result = diffTexts({
      left: '{"version":1}\n',
      right: '{"version":2}\n',
      pathname: 'note.arx',
      leftLabel: 'L',
      rightLabel: 'R',
    })
    expect(result.kind).toBe('lines')
  })
})

describe('diffNodes', () => {
  it('labels sides and lists block changes', () => {
    const result = diffNodes({
      left: doc(block('a', 'old')),
      right: doc(block('a', 'new')),
      leftLabel: 'Saved version',
      rightLabel: 'Current',
    })
    expect(result.leftLabel).toBe('Saved version')
    expect(result.rightLabel).toBe('Current')
    expect(result.kind).toBe('blocks')
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks?.[0].kind).toBe('changed')
  })
})
