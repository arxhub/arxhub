import { ConsoleLogger } from '@arxhub/logger'
import { describe, expect, it } from 'vitest'
import { mergeArx } from '../arx-merge'
import { ArxEditorExtension } from '../editor-extension'
import { deserialize, serialize } from '../editor-format'
import { reconfigureSelect, selectedLabel, selectOptions } from '../editor-mode'
import { schema } from '../editor-schema'
import { SELECT_FORMAT_VERSION } from '../select-options'

const migrate = SELECT_FORMAT_VERSION.migrations[1]
const legacy = (options: unknown, value: unknown) => ({ type: 'select', attrs: { label: 'Priority', options, value } })
const file = (content: unknown[], plugins?: Record<string, number>) =>
  JSON.stringify({ version: 1, ...(plugins ? { plugins } : {}), doc: { type: 'doc', content } })

function kit() {
  const editor = new ArxEditorExtension({ logger: new ConsoleLogger() })
  editor.seal()
  return editor.kit
}

describe('dropdown options carry an identity', () => {
  it('migrates a list of strings so the stored value still names its option', () => {
    expect(migrate(legacy(['Low', 'High'], 'High'))).toEqual(
      legacy(
        [
          { id: 'Low', label: 'Low' },
          { id: 'High', label: 'High' },
        ],
        'High',
      ),
    )
    expect(migrate(legacy(['Low', 'Low', 7, 'High'], 'Missing'))).toEqual(
      legacy(
        [
          { id: 'Low', label: 'Low' },
          { id: 'High', label: 'High' },
        ],
        null,
      ),
    )
    const already = legacy([{ id: 'k1', label: 'Low' }], 'k1')
    expect(migrate(already)).toEqual(already)
  })

  it('reads a version 1 file, writes it back at version 2, and reads that again unchanged', () => {
    const editor = kit()
    const doc = deserialize(editor.schema, file([legacy(['Low', 'High'], 'Low')]), editor.format)
    expect(selectOptions(doc.firstChild!)).toEqual([
      { id: 'Low', label: 'Low' },
      { id: 'High', label: 'High' },
    ])
    expect(doc.firstChild?.attrs.value).toBe('Low')
    const saved = serialize(doc, editor.format)
    expect(JSON.parse(saved).plugins[SELECT_FORMAT_VERSION.id]).toBe(2)
    expect(deserialize(editor.schema, saved, editor.format).eq(doc)).toBe(true)
  })

  it('refuses a shape that is neither the old list nor the new one', () => {
    const editor = kit()
    expect(() => deserialize(editor.schema, file([legacy([{ id: 'a' }], null)], { [SELECT_FORMAT_VERSION.id]: 2 }), editor.format)).toThrow()
    expect(() =>
      deserialize(
        editor.schema,
        file(
          [
            legacy(
              [
                { id: 'a', label: 'A' },
                { id: 'a', label: 'B' },
              ],
              null,
            ),
          ],
          { [SELECT_FORMAT_VERSION.id]: 2 },
        ),
        editor.format,
      ),
    ).toThrow()
  })

  it('a three-way merge of files written before options had ids still reads them', () => {
    const local = file([{ type: 'paragraph', content: [{ type: 'text', text: 'Same' }] }, legacy(['Low', 'High'], 'High')])
    const { merged, conflicts } = mergeArx(null, local, local)
    expect(conflicts).toBe(0)
    const doc = deserialize(kit().schema, merged, kit().format)
    expect(doc.child(1).attrs.value).toBe('High')
    expect(selectOptions(doc.child(1))).toHaveLength(2)
  })
})

describe('reconfiguring a dropdown', () => {
  const node = schema.nodes.select.create({
    label: 'Priority',
    options: [
      { id: 'a', label: 'Low' },
      { id: 'b', label: 'Mid' },
      { id: 'c', label: 'High' },
    ],
    value: 'b',
  })
  const ids = (options: { id: string }[]) => options.map((option) => option.id)

  it('a renamed option is the same option, so the value survives', () => {
    const next = reconfigureSelect(node, ['Low', 'Medium', 'High'])
    expect(ids(next.options)).toEqual(['a', 'b', 'c'])
    expect(next.options[1].label).toBe('Medium')
    expect(next.value).toBe('b')
    expect(selectedLabel(schema.nodes.select.create({ ...node.attrs, ...next }))).toBe('Medium')
  })

  it('a removed option is gone, and a value that named it goes with it', () => {
    const next = reconfigureSelect(node, ['Low', 'High'])
    expect(ids(next.options)).toEqual(['a', 'c'])
    expect(next.value).toBeNull()
  })

  it('a new line is a new option with an id of its own', () => {
    const next = reconfigureSelect(node, ['Low', 'Mid', 'High', 'Urgent'])
    expect(ids(next.options).slice(0, 3)).toEqual(['a', 'b', 'c'])
    expect(next.options[3].id).toMatch(/^[a-z0-9-]+$/)
    expect(new Set(ids(next.options)).size).toBe(4)
    expect(next.value).toBe('b')
  })

  it('options follow their labels when reordered, and collapse when repeated or blank', () => {
    expect(ids(reconfigureSelect(node, ['High', 'Low', 'Mid']).options)).toEqual(['c', 'a', 'b'])
    const collapsed = reconfigureSelect(node, ['Low', ' Low ', '', 'Mid'])
    expect(collapsed.options).toEqual([
      { id: 'a', label: 'Low' },
      { id: 'b', label: 'Mid' },
    ])
  })

  it('several renames at once pair up in order', () => {
    const next = reconfigureSelect(node, ['Lo', 'Mid', 'Hi'])
    expect(next.options).toEqual([
      { id: 'a', label: 'Lo' },
      { id: 'b', label: 'Mid' },
      { id: 'c', label: 'Hi' },
    ])
  })
})
