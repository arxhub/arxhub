import { ConsoleLogger } from '@arxhub/logger'
import { EditorState } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { ArxEditorExtension } from '../editor-extension'
import { deserialize, serialize } from '../editor-format'
import { schema } from '../editor-schema'
import { SELECT_FORMAT_VERSION } from '../select-options'

function kit() {
  const editor = new ArxEditorExtension({ logger: new ConsoleLogger() })
  editor.register({
    id: 'ratings',
    version: 3,
    legacyNodes: ['old_rating'],
    nodes: { rating: { group: 'block', atom: true, attrs: { value: { default: 0, validate: 'number' } }, toDOM: () => ['div'] } },
    migrations: {
      1: (node) => ({ type: 'rating', attrs: { value: (node.attrs as { score: string }).score } }),
      2: (node) => ({ ...node, attrs: { value: Number((node.attrs as { value: string }).value) } }),
    },
  })
  editor.seal()
  return editor.kit
}

describe('plugin data migrations', () => {
  it('runs each version once, retains its metadata through edits and restores after disabling the plugin', () => {
    const editor = kit()
    const raw = JSON.stringify({
      version: 1,
      plugins: { ratings: 1 },
      doc: {
        type: 'doc',
        content: [
          { type: 'old_rating', attrs: { score: '4' } },
          { type: 'paragraph', content: [{ type: 'text', text: 'Neighbor' }] },
        ],
      },
    })
    const doc = deserialize(editor.schema, raw, editor.format)
    expect(doc.firstChild?.type.name).toBe('rating')
    expect(doc.firstChild?.attrs.value).toBe(4)
    let state = EditorState.create({ doc })
    state = state.apply(state.tr.insertText(' edited', state.doc.content.size - 1))
    const saved = serialize(state.doc, editor.format)
    expect(JSON.parse(saved).plugins).toEqual({ ratings: 3, [SELECT_FORMAT_VERSION.id]: 2 })
    const disabled = deserialize(schema, saved)
    expect(disabled.firstChild?.type.name).toBe('unknown_block')
    const restored = deserialize(editor.schema, serialize(disabled), editor.format)
    expect(restored.eq(state.doc)).toBe(true)
    expect(raw).toContain('old_rating')
  })

  it('keeps future plugin data opaque, including its version when the block is copied to another document', () => {
    const editor = kit()
    const original = { type: 'rating', attrs: { value: 3, future: { keep: true } } }
    const doc = deserialize(
      editor.schema,
      JSON.stringify({ version: 1, plugins: { ratings: 9 }, doc: { type: 'doc', content: [original] } }),
      editor.format,
    )
    expect(doc.firstChild?.type.name).toBe('unknown_block')
    const copied = editor.schema.node('doc', null, doc.firstChild!)
    const saved = JSON.parse(serialize(copied, editor.format))
    expect(saved.plugins.ratings).toBe(9)
    expect(saved.doc.content[0]).toEqual(original)
  })

  it('refuses missing steps and failed migrations before a buffer can save', () => {
    const editor = new ArxEditorExtension({ logger: new ConsoleLogger() })
    editor.register({ id: 'broken', version: 2 })
    expect(() => editor.seal()).toThrow('Missing migration')
    const built = kit()
    const bad = JSON.stringify({ version: 1, doc: { type: 'doc', content: [{ type: 'old_rating', attrs: null }] } })
    expect(() => deserialize(built.schema, bad, built.format)).toThrow('Data migration failed')
    const mixed = JSON.stringify({
      version: 1,
      doc: { type: 'doc', content: [{ type: 'missing_plugin', content: [{ type: 'old_rating', attrs: { score: '4' } }] }] },
    })
    expect(() => deserialize(built.schema, mixed, built.format)).toThrow('Enable compatible versions')
  })
})
