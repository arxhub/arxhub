import { ConsoleLogger } from '@arxhub/logger'
import { history, undo } from 'prosemirror-history'
import { AllSelection, EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { describe, expect, it } from 'vitest'
import { ArxEditorExtension } from '../editor-extension'
import { deserialize, serialize } from '../editor-format'
import { editorModeKey, modePlugin } from '../editor-mode'
import { changePageProperties, pageProperties } from '../page-properties'
import { propertiesContribution } from '../properties-block'

function editor(content: unknown[]) {
  const extension = new ArxEditorExtension({ logger: new ConsoleLogger() })
  extension.register(propertiesContribution())
  extension.seal()
  const kit = extension.kit
  const doc = deserialize(kit.schema, JSON.stringify({ version: 1, custom: { keep: true }, doc: { type: 'doc', content } }), kit.format)
  let state = EditorState.create({ doc, plugins: [history(), modePlugin('editable', kit.controls)] })
  const view = {
    get state() {
      return state
    },
    isDestroyed: false,
    dispatch(tr: Parameters<EditorState['apply']>[0]) {
      state = state.apply(tr)
    },
  } as unknown as EditorView
  return { kit, view }
}
const properties = {
  type: 'properties',
  attrs: { tags: ['work'], favorite: false, fields: [{ key: 'Status', value: 'Draft' }], subject: { path: 'file.pdf' } },
}
const paragraph = { type: 'paragraph', content: [{ type: 'text', text: 'Body' }] }

describe('page properties outside the body', () => {
  it('preserves stored properties, index compatibility and undo while body replacement cannot delete them', () => {
    const { view, kit } = editor([properties, paragraph])
    expect(view.state.doc.childCount).toBe(1)
    expect(view.state.doc.firstChild?.type.name).toBe('paragraph')
    expect(pageProperties(view.state.doc)?.attrs.tags).toEqual(['work'])
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)).insertText('Replaced body'))
    expect(pageProperties(view.state.doc)?.attrs.subject).toEqual({ path: 'file.pdf' })
    const output = JSON.parse(serialize(view.state.doc, kit.format))
    expect(output.doc.content[0].attrs).toMatchObject(properties.attrs)
    expect(output.doc.content[1].content[0].text).toBe('Replaced body')
    expect(output.custom).toEqual({ keep: true })
    expect(deserialize(kit.schema, serialize(view.state.doc, kit.format), kit.format).eq(view.state.doc)).toBe(true)
    expect(undo(view.state, view.dispatch)).toBe(true)
    expect(view.state.doc.textContent).toBe('Body')
  })

  it('keeps metadata-only cards writable and no longer offers properties in the insertion menu', () => {
    const { view, kit } = editor([properties])
    expect(view.state.doc.firstChild?.type.name).toBe('paragraph')
    expect(kit.commands.some((command) => command.id === 'properties')).toBe(false)
    expect(JSON.parse(serialize(view.state.doc, kit.format)).doc.content[0].attrs.tags).toEqual(['work'])
  })

  it('lets interactive mode toggle only favorite, including on older files without block ids', () => {
    const { view } = editor([properties, paragraph])
    view.dispatch(view.state.tr.setMeta(editorModeKey, 'interactive'))
    changePageProperties(view, { favorite: true })
    expect(pageProperties(view.state.doc)?.attrs.favorite).toBe(true)
    changePageProperties(view, { tags: ['forbidden'], fields: [] })
    expect(pageProperties(view.state.doc)?.attrs.tags).toEqual(['work'])
    expect(pageProperties(view.state.doc)?.attrs.fields).toEqual(properties.attrs.fields)
    undo(view.state, view.dispatch)
    expect(pageProperties(view.state.doc)?.attrs.favorite).toBe(false)
    view.dispatch(view.state.tr.setMeta(editorModeKey, 'readonly'))
    changePageProperties(view, { favorite: true })
    expect(pageProperties(view.state.doc)?.attrs.favorite).toBe(false)
  })

  it('creates new properties with normal document history', () => {
    const { view, kit } = editor([paragraph])
    changePageProperties(view, { tags: ['new'] })
    expect(pageProperties(view.state.doc)?.attrs.tags).toEqual(['new'])
    expect(JSON.parse(serialize(view.state.doc, kit.format)).doc.content[0].type).toBe('properties')
    undo(view.state, view.dispatch)
    expect(pageProperties(view.state.doc)).toBeNull()
    expect(view.state.doc.textContent).toBe('Body')
  })
})
