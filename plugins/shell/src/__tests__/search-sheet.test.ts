import { describe, expect, test } from 'vitest'
import type { Component } from 'vue'
import { chooseEntry, sheetSections } from '../ui/search-sheet'
import { type ObjectRef, type OpenedObject, objectGone, type TabType } from '../ui/tab-type'
import { TabTypeRegistry } from '../ui/tab-type-registry'
import { Workspace } from '../ui/workspace'
import { FakePanelHost } from './fake-panel-host'

const View = { name: 'view' } as Component

// The note store of the fixture: what is in it opens, everything else is gone.
const vault = new Set(['a.md', 'b.md'])

function note(id: string): OpenedObject {
  return { key: `note:${id}`, title: id, component: View, props: { path: id }, snapshot: () => ({ path: id }) }
}

const notesType: TabType = {
  id: 'notes',
  icon: 'lu:file-text',
  title: 'Notes',
  open: { title: 'Open notes' },
  objects: {
    open: (ref: ObjectRef) => Promise.resolve(note(ref.id)),
    revive: (snapshot) => {
      const path = (snapshot as { path?: string }).path
      return Promise.resolve(path != null && vault.has(path) ? note(path) : objectGone)
    },
    label: (object) => ({ title: object.title }),
  },
}

const settingsType: TabType = { id: 'settings', icon: 'lu:settings', title: 'Settings', content: View }
const logsType: TabType = { id: 'logs', icon: 'lu:scroll-text', title: 'Logs', pinned: false, content: View }

function build(): { workspace: Workspace; types: TabTypeRegistry } {
  const types = new TabTypeRegistry()
  types.register(notesType)
  types.register(settingsType)
  types.register(logsType)
  return { workspace: new Workspace({ types, createPanels: () => new FakePanelHost() }), types }
}

describe('the search sheet: two guaranteed sections', () => {
  test('both sections are there on an untouched desk, and both say what they hold', () => {
    const { workspace, types } = build()

    const sections = sheetSections(workspace, types)
    expect(sections.map((it) => it.id)).toEqual(['open', 'new'])
    // Nothing is open, and the section says so rather than disappearing: a section that comes and goes
    // makes the reader wonder whether it exists.
    expect(sections[0].entries).toEqual([])
    expect(sections[0].empty).not.toBe('')
  })

  test('"open new" is the whole registry, including a type with no place in the row', () => {
    const { workspace, types } = build()

    const entries = sheetSections(workspace, types)[1].entries
    expect(entries.map((it) => it.typeId)).toEqual(['notes', 'settings', 'logs'])
    // The unpinned one is exactly what the sheet exists for: it is reachable nowhere else.
    expect(entries.some((it) => it.typeId === 'logs')).toBe(true)
  })

  test('everything open is listed, objects and object-less types alike', async () => {
    const { workspace, types } = build()
    await workspace.openObject('notes', { id: 'a.md' })
    await workspace.openObject('notes', { id: 'b.md' })
    workspace.activateType('settings')

    const entries = sheetSections(workspace, types)[0].entries
    expect(entries.map((it) => it.title)).toEqual(['a.md', 'b.md', 'Settings'])
    // A settings row carries no object key, so choosing it means "switch to the type" — the sheet's one
    // operation covers both without a second branch at the call site.
    expect(entries.map((it) => it.objectKey)).toEqual(['note:a.md', 'note:b.md', undefined])
  })

  test('a type open with nothing inside it is still what is open', async () => {
    const { workspace, types } = build()
    workspace.activateType('notes')

    expect(sheetSections(workspace, types)[0].entries.map((it) => it.title)).toEqual(['Notes'])
  })

  test('an open type appears in both sections under different ids', () => {
    const { workspace, types } = build()
    workspace.activateType('settings')

    const [open, fresh] = sheetSections(workspace, types)
    const ids = [...open.entries, ...fresh.entries].map((it) => it.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('a tab whose object is gone says so instead of naming its type', async () => {
    const { workspace, types } = build()
    await workspace.restore({
      activeTypeId: 'notes',
      types: [{ id: 'notes', activeKey: null, tabs: [{ key: 'note:x.md', title: 'x.md', object: { path: 'x.md' } }] }],
    })

    expect(sheetSections(workspace, types)[0].entries.map((it) => it.meta)).toEqual(['Gone'])
  })

  test('choosing a row opens or switches to it, and never needs to know which', async () => {
    const { workspace, types } = build()
    await workspace.openObject('notes', { id: 'a.md' })
    workspace.activateType('settings')

    const [open, fresh] = sheetSections(workspace, types)
    chooseEntry(workspace, open.entries[0])
    expect(workspace.activeTypeId.value).toBe('notes')
    expect(workspace.activeTab('notes')?.key).toBe('note:a.md')

    chooseEntry(workspace, fresh.entries.find((it) => it.typeId === 'logs') ?? fresh.entries[0])
    expect(workspace.activeTypeId.value).toBe('logs')
  })
})
