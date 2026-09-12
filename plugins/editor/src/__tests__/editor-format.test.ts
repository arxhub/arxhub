import { describe, expect, it } from 'vitest'
import { deserialize, serialize } from '../editor-format'
import { schema } from '../editor-schema'

const file = (doc: unknown, version = 1) => JSON.stringify({ version, doc })
const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] }

describe('arx storage boundary', () => {
  it('round-trips supported content', () => {
    const doc = deserialize(schema, file({ type: 'doc', content: [paragraph] }))
    expect(deserialize(schema, serialize(doc)).eq(doc)).toBe(true)
  })

  it.each([
    file({ type: 'doc', content: [paragraph] }, 2),
    file(paragraph),
    file({ type: 'doc', content: [{ type: 'task_list', content: [paragraph] }] }),
    file({ type: 'doc', content: [{ type: 'task_list', content: [{ type: 'task_item', attrs: { checked: 'yes' }, content: [paragraph] }] }] }),
    file({ type: 'doc', content: [{ type: 'select', attrs: { options: [1, 2] } }] }),
  ])('rejects unsupported or invalid data before it can be silently normalized', (raw) => {
    expect(() => deserialize(schema, raw)).toThrow()
  })

  it('preserves unknown trees, marks, fields and document metadata on roundtrip', () => {
    const unknown = { type: 'plugin_block', attrs: { secret: 'keep', nested: { array: [1, null, 'x'] } }, future: true, content: [paragraph] }
    const marked = {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Protected', marks: [{ type: 'plugin_mark', attrs: { color: 'custom' } }] }],
    }
    const original = {
      version: 1,
      plugins: { absent: 7 },
      future: { intact: true },
      doc: { type: 'doc', attrs: { custom: 'root metadata' }, content: [unknown, marked, paragraph] },
    }
    const doc = deserialize(schema, JSON.stringify(original))
    expect(doc.child(0).type.name).toBe('unknown_block')
    expect(doc.child(1).type.name).toBe('unknown_block')
    const output = JSON.parse(serialize(doc))
    expect(output).toEqual(original)
    expect(deserialize(schema, serialize(doc)).eq(doc)).toBe(true)
  })
})
