import { describe, expect, test, vi } from 'vitest'
import { type DocumentBarHandlers, type DocumentBarState, documentBarMenu, documentBarSub, editorModeMenu } from '../document-bar'

function handlers(): DocumentBarHandlers {
  return {
    outline: vi.fn(),
    find: vi.fn(),
    properties: vi.fn(),
    versions: vi.fn(),
    mode: vi.fn(),
    appearance: vi.fn(),
    save: vi.fn(),
    backlinks: vi.fn(),
    copyLink: vi.fn(),
  }
}

function state(over: Partial<DocumentBarState> = {}): DocumentBarState {
  return { mode: 'editable', canSave: true, busy: false, hasLinks: false, hasHistory: false, publication: [], ...over }
}

describe('documentBarMenu', () => {
  test("leads with the reader's tools and never offers undo or redo", () => {
    const labels = documentBarMenu(state({ hasHistory: true }), handlers()).map((item) => item.label)

    expect(labels.slice(0, 4)).toEqual(['Document outline', 'Find in document', 'Properties', 'Saved versions'])
    expect(labels).not.toContain('Undo')
    expect(labels).not.toContain('Redo')
  })

  test('read only drops Save and leaves the page icon unavailable', () => {
    const menu = documentBarMenu(state({ mode: 'readonly' }), handlers())

    expect(menu.map((item) => item.id)).not.toContain('editor.save')
    expect(menu.find((item) => item.id === 'editor.appearance')?.disabled).toBe(true)
    expect(menu.find((item) => item.id === 'editor.mode')?.label).toBe('Editor mode: Read only')
  })

  test('a document that is not loaded yet offers no tool but the mode', () => {
    const menu = documentBarMenu(state({ canSave: false, hasLinks: true }), handlers())

    expect(menu.filter((item) => !item.disabled).map((item) => item.id)).toEqual(['editor.mode'])
  })

  test('backlinks and versions appear only where the extension provides them', () => {
    const without = documentBarMenu(state(), handlers()).map((item) => item.id)
    const withAll = documentBarMenu(state({ hasLinks: true, hasHistory: true }), handlers()).map((item) => item.id)

    expect(without).not.toContain('editor.backlinks')
    expect(without).not.toContain('editor.versions')
    expect(withAll).toEqual(expect.arrayContaining(['editor.backlinks', 'editor.copy-link', 'editor.versions']))
  })

  test('the mode row hands over the current mode, and publication actions are held while uploading', () => {
    const on = handlers()
    const publish = { id: 'publish', label: 'Publish', onSelect: vi.fn() }
    const menu = documentBarMenu(state({ mode: 'interactive', busy: true, publication: [publish] }), on)

    menu.find((item) => item.id === 'editor.mode')?.onSelect()
    expect(on.mode).toHaveBeenCalledWith('interactive')
    expect(menu.find((item) => item.id === 'publish')?.disabled).toBe(true)
  })
})

describe('editorModeMenu', () => {
  test('the current mode cannot be picked again', () => {
    const pick = vi.fn()
    const menu = editorModeMenu('editable', pick)

    expect(menu.find((item) => item.id === 'editor.mode.editable')?.disabled).toBe(true)
    menu.find((item) => item.id === 'editor.mode.readonly')?.onSelect()
    expect(pick).toHaveBeenCalledWith('readonly')
  })
})

describe('documentBarSub', () => {
  const ok = { canSave: true, loadError: false, saveError: false, saving: false, uploading: false, unsaved: false, mode: 'editable' as const }

  test('says nothing while the document is saved and editable', () => {
    expect(documentBarSub(ok)).toBeUndefined()
  })

  test('a failure outranks progress, and progress outranks the mode', () => {
    expect(documentBarSub({ ...ok, saveError: true, saving: true })).toBe('Save failed')
    expect(documentBarSub({ ...ok, saving: true, mode: 'readonly' })).toBe('Saving…')
    expect(documentBarSub({ ...ok, mode: 'readonly' })).toBe('Read only')
    expect(documentBarSub({ ...ok, canSave: false, loadError: true })).toBe('Unavailable')
  })
})
