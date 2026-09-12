import { ConsoleLogger } from '@arxhub/logger'
import type { NodeSpec } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { ArxEditorExtension } from '../editor-extension'
import { deserialize, serialize } from '../editor-format'
import { modePlugin } from '../editor-mode'

const extension = () => new ArxEditorExtension({ logger: new ConsoleLogger() })
const rating: NodeSpec = {
  toDOM: (node) => ['div', String(node.attrs.value)],
  group: 'block',
  atom: true,
  attrs: { value: { default: 0, validate: 'number' }, maximum: { default: 5, validate: 'number' } },
}

describe('editor contributions', () => {
  it('loads a plugin block and permits only its declared interactive values', () => {
    const editor = extension()
    const component = defineComponent({ render: () => null })
    editor.register({
      id: 'ratings',
      nodes: { rating },
      components: { rating: { component } },
      controls: { rating: { value: (value, before) => typeof value === 'number' && value >= 0 && value <= before.attrs.maximum } },
      commands: (schema) => [
        {
          id: 'rating',
          label: 'Rating',
          keywords: 'score',
          icon: 'lu:star',
          run: (state, dispatch) => {
            dispatch?.(state.tr.replaceSelectionWith(schema.nodes.rating.create()))
            return true
          },
        },
      ],
    })
    editor.seal()
    const { kit } = editor
    const doc = kit.schema.node('doc', null, kit.schema.nodes.rating.create())
    expect(deserialize(kit.schema, serialize(doc)).eq(doc)).toBe(true)
    expect(kit.components.rating.component).toBe(component)
    expect(kit.commands.at(-1)?.id).toBe('rating')
    const state = EditorState.create({ doc, plugins: [modePlugin('interactive', kit.controls)] })
    expect(state.apply(state.tr.setNodeMarkup(0, undefined, { value: 3, maximum: 5 })).doc.firstChild?.attrs.value).toBe(3)
    expect(state.apply(state.tr.setNodeMarkup(0, undefined, { value: 6, maximum: 5 }))).toBe(state)
    expect(state.apply(state.tr.setNodeMarkup(0, undefined, { value: 3, maximum: 10 }))).toBe(state)
    expect(state.apply(state.tr.delete(0, doc.content.size))).toBe(state)
  })

  it('binds built-in commands to the composed schema', () => {
    const editor = extension()
    editor.register({ id: 'ratings', nodes: { rating } })
    editor.seal()
    let state = EditorState.create({ schema: editor.kit.schema })
    editor.kit.commands
      .find((command) => command.id === 'heading-1')
      ?.run(state, (tr) => {
        state = state.apply(tr)
      })
    expect(state.doc.firstChild?.type).toBe(editor.kit.schema.nodes.heading)
  })

  it('rejects duplicate identities and changes after startup', () => {
    const editor = extension()
    editor.register({ id: 'ratings', nodes: { rating } })
    expect(() => editor.register({ id: 'ratings' })).toThrow('Duplicate')
    editor.seal()
    expect(() => editor.register({ id: 'late' })).toThrow('configure')
    const duplicate = extension()
    duplicate.register({ id: 'bad', nodes: { paragraph: rating } })
    expect(() => duplicate.seal()).toThrow('already registered')
    const commands = extension()
    commands.register({ id: 'bad', commands: () => [{ id: 'paragraph', label: 'bad', icon: '', keywords: '', run: () => false }] })
    expect(() => commands.seal()).toThrow('already registered')
  })

  it('creates separate ProseMirror plugins for each open document', () => {
    const editor = extension()
    editor.register({ id: 'local', plugins: () => [modePlugin('editable')] })
    editor.seal()
    expect(editor.kit.plugins()[0]).not.toBe(editor.kit.plugins()[0])
  })
})
