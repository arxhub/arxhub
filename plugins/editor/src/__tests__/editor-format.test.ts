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
    file({ type: 'doc', content: [{ type: 'plugin_block', attrs: { secret: 'keep' } }] }),
    file({ type: 'doc', content: [{ ...paragraph, attrs: { plugin_data: 'keep' } }] }),
    file({ type: 'doc', content: [{ type: 'task_list', content: [paragraph] }] }),
    file({ type: 'doc', content: [{ type: 'task_list', content: [{ type: 'task_item', attrs: { checked: 'yes' }, content: [paragraph] }] }] }),
    file({ type: 'doc', content: [{ type: 'select', attrs: { options: [1, 2] } }] }),
  ])('rejects unsupported or invalid data before it can be silently normalized', (raw) => {
    expect(() => deserialize(schema, raw)).toThrow()
  })
})
