import { describe, expect, test } from 'vitest'
import type { Component } from 'vue'
import { type ObjectRef, type OpenedObject, objectGone, type TabType } from '../ui/tab-type'
import { TabTypeRegistry } from '../ui/tab-type-registry'
import { stagesOf } from '../ui/type-stage'
import { Workspace } from '../ui/workspace'
import { FakePanelHost } from './fake-panel-host'

const NoteView = { name: 'note' } as Component
const SettingsView = { name: 'settings' } as Component
const LogsView = { name: 'logs' } as Component

function notesType(): TabType {
  return {
    id: 'notes',
    icon: 'lu:file-text',
    title: 'Notes',
    objects: {
      open: (ref: ObjectRef): Promise<OpenedObject> =>
        Promise.resolve({ key: `note:${ref.id}`, title: ref.id, component: NoteView, props: {}, snapshot: () => null }),
      revive: () => Promise.resolve(objectGone),
      label: (object: OpenedObject) => ({ title: object.title }),
    },
  } as TabType
}

function settingsType(): TabType {
  return { id: 'settings', icon: 'lu:settings', title: 'Settings', content: SettingsView } as TabType
}

function logsType(): TabType {
  return { id: 'logs', icon: 'lu:list', title: 'Logs', pinned: false, content: LogsView } as TabType
}

function build(): { workspace: Workspace; types: TabTypeRegistry } {
  const types = new TabTypeRegistry()
  for (const type of [notesType(), settingsType(), logsType()]) types.register(type)
  return { workspace: new Workspace({ types, createPanels: () => new FakePanelHost() }), types }
}

// What F-05 rests on, stated as data: which types are on stage, in which order, and which of them the
// frame is about to hide rather than tear down.
describe('the stages both frames mount', () => {
  test('a type is staged only once it has been entered', () => {
    const { workspace, types } = build()

    expect(stagesOf(workspace, types, [])).toEqual([])

    workspace.activateType('settings')
    expect(stagesOf(workspace, types, ['settings']).map((it) => it.typeId)).toEqual(['settings'])
  })

  test('a type that is no longer active keeps its stage — this is the whole feature', () => {
    const { workspace, types } = build()
    workspace.activateType('notes')
    workspace.activateType('settings')

    const stages = stagesOf(workspace, types, ['notes', 'settings'])
    expect(stages.map((it) => it.typeId)).toEqual(['notes', 'settings'])
    // Order of first visit, not of activation: a stage that moved would be re-created by its key and
    // the state it was kept for would go with it.
    workspace.activateType('notes')
    expect(stagesOf(workspace, types, ['notes', 'settings']).map((it) => it.typeId)).toEqual(['notes', 'settings'])
  })

  test('a type with objects stages its panel host, a type without stages itself', () => {
    const { workspace, types } = build()
    workspace.activateType('notes')
    workspace.activateType('settings')

    const stages = stagesOf(workspace, types, ['notes', 'settings'])
    expect(stages[0].view).toBe(workspace.panelsOf('notes')?.view)
    expect(stages[1].view).toBe(SettingsView)
  })

  test('closing a type takes its stage away — the only bound on what stays mounted', () => {
    const { workspace, types } = build()
    workspace.activateType('notes')
    workspace.activateType('logs')
    workspace.closeType('logs')

    expect(stagesOf(workspace, types, ['notes', 'logs']).map((it) => it.typeId)).toEqual(['notes'])
  })

  // A type unregistered while it is open (a plugin switched off on the next boot restores a desk that
  // still names it) has nothing to draw, and a stage with no view would be a blank box the person
  // cannot leave by any means the row offers.
  test('a type whose registration is gone is not staged', () => {
    const { workspace, types } = build()
    workspace.activateType('settings')
    types.unregister('settings')

    expect(stagesOf(workspace, types, ['settings'])).toEqual([])
  })
})
