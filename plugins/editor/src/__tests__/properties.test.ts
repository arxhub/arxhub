import { describe, expect, it } from 'vitest'
import {
  addField,
  emptyPropertiesAttrs,
  ensureProperties,
  hasProperties,
  type PropertiesAttrs,
  propertiesOf,
  toggleFavorite,
  withField,
  withoutField,
  withoutTag,
  withTag,
} from '../properties'

describe('ensureProperties', () => {
  it('inserts a properties block at the top of an empty document', () => {
    const doc = ensureProperties({ type: 'doc', content: [] })
    expect(doc.content).toEqual([{ type: 'properties', attrs: emptyPropertiesAttrs() }])
  })

  it('carries the subject for a card beside a non-.arx file', () => {
    const doc = ensureProperties({ type: 'doc', content: [] }, { path: 'photo.jpg', fileId: 'abc' })
    expect(doc.content).toEqual([{ type: 'properties', attrs: emptyPropertiesAttrs({ path: 'photo.jpg', fileId: 'abc' }) }])
  })

  it('leaves existing content in place, unmoved and untouched', () => {
    const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }
    const doc = ensureProperties({ type: 'doc', content: [paragraph] })
    expect(doc.content).toEqual([{ type: 'properties', attrs: emptyPropertiesAttrs() }, paragraph])
  })

  it('is a no-op when the document already opens on a properties block', () => {
    const original = { type: 'doc', content: [{ type: 'properties', attrs: { tags: ['a'], favorite: true, fields: [] } }] }
    expect(ensureProperties(original)).toBe(original)
  })

  it('does not treat a properties block anywhere but first as already present', () => {
    const paragraph = { type: 'paragraph' }
    const buried = { type: 'properties', attrs: emptyPropertiesAttrs() }
    const doc = ensureProperties({ type: 'doc', content: [paragraph, buried] })
    expect(doc.content).toEqual([{ type: 'properties', attrs: emptyPropertiesAttrs() }, paragraph, buried])
  })
})

describe('hasProperties / propertiesOf', () => {
  it('reads null when the document has none', () => {
    expect(hasProperties({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(false)
    expect(propertiesOf({ type: 'doc', content: [{ type: 'paragraph' }] })).toBeNull()
  })

  it('normalises a well-formed block', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'properties', attrs: { tags: ['a', 'b'], favorite: true, fields: [{ key: 'k', value: 'v' }] } }],
    }
    expect(hasProperties(doc)).toBe(true)
    expect(propertiesOf(doc)).toEqual({ tags: ['a', 'b'], favorite: true, fields: [{ key: 'k', value: 'v' }] })
  })

  it('drops garbage rather than throwing — a hand-edited or partially-written file is still readable', () => {
    const doc = { type: 'doc', content: [{ type: 'properties', attrs: { tags: ['ok', 1, null], favorite: 'yes', fields: 'nope' } }] }
    expect(propertiesOf(doc)).toEqual({ tags: ['ok'], favorite: false, fields: [] })
  })

  it('keeps a valid subject and drops an invalid one', () => {
    const withSubject = {
      type: 'doc',
      content: [{ type: 'properties', attrs: { tags: [], favorite: false, fields: [], subject: { path: 'a.jpg' } } }],
    }
    expect(propertiesOf(withSubject)?.subject).toEqual({ path: 'a.jpg' })

    const withoutSubject = { type: 'doc', content: [{ type: 'properties', attrs: { tags: [], favorite: false, fields: [] } }] }
    expect(propertiesOf(withoutSubject)?.subject).toBeUndefined()
  })
})

describe('withTag / withoutTag', () => {
  const base = emptyPropertiesAttrs()

  it('adds a trimmed tag once', () => {
    expect(withTag(base, ' family ').tags).toEqual(['family'])
  })

  it('does not add the same tag twice', () => {
    const once = withTag(base, 'family')
    expect(withTag(once, 'family')).toBe(once)
  })

  it('drops an empty or blank tag', () => {
    expect(withTag(base, '   ')).toBe(base)
  })

  it('removes a tag that is present and is a no-op otherwise', () => {
    const withOne: PropertiesAttrs = { ...base, tags: ['family'] }
    expect(withoutTag(withOne, 'family').tags).toEqual([])
    expect(withoutTag(withOne, 'nope')).toBe(withOne)
  })
})

describe('toggleFavorite', () => {
  it('flips the flag', () => {
    const base = emptyPropertiesAttrs()
    expect(toggleFavorite(base).favorite).toBe(true)
    expect(toggleFavorite(toggleFavorite(base)).favorite).toBe(false)
  })
})

describe('withField / addField / withoutField', () => {
  it('appends an empty field', () => {
    expect(addField(emptyPropertiesAttrs()).fields).toEqual([{ key: '', value: '' }])
  })

  it('patches one field by index, leaving the others alone', () => {
    const base: PropertiesAttrs = {
      ...emptyPropertiesAttrs(),
      fields: [
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ],
    }
    expect(withField(base, 1, { value: '9' }).fields).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '9' },
    ])
  })

  it('ignores an out-of-range index', () => {
    const base = emptyPropertiesAttrs()
    expect(withField(base, 0, { key: 'a' })).toBe(base)
  })

  it('removes a field by index', () => {
    const base: PropertiesAttrs = {
      ...emptyPropertiesAttrs(),
      fields: [
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ],
    }
    expect(withoutField(base, 0).fields).toEqual([{ key: 'b', value: '2' }])
  })
})
