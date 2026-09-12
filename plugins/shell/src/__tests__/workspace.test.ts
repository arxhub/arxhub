import { beforeEach, describe, expect, test } from 'vitest'
import type { Component } from 'vue'
import type { WorkspaceEvents } from '../ui/nav-events'
import { type Json, type ObjectRef, type OpenedObject, objectGone, type TabType } from '../ui/tab-type'
import { TabTypeRegistry } from '../ui/tab-type-registry'
import { Workspace } from '../ui/workspace'
import { FakePanelHost } from './fake-panel-host'

const NoteView = { name: 'note' } as Component
const LogsView = { name: 'logs' } as Component
const NotesNav = { name: 'notes-nav' } as Component
const NotesDock = { name: 'notes-dock' } as Component
const ObjectDock = { name: 'object-dock' } as Component

// The fixture's note store: what is in it opens, everything else is gone.
let vault: Set<string>
let openCalls: ObjectRef[]

function note(id: string): OpenedObject {
  return {
    key: `note:${id}`,
    title: id,
    component: NoteView,
    props: { path: id },
    snapshot: () => ({ path: id }),
  }
}

function notesType(extra: Partial<TabType> = {}): TabType {
  return {
    id: 'notes',
    icon: 'lu:file-text',
    title: 'Notes',
    order: 10,
    nav: { component: NotesNav, title: 'Files' },
    open: { title: 'Open notes' },
    dock: (active) => (active == null ? NotesDock : ObjectDock),
    objects: {
      open: (ref) => {
        openCalls.push(ref)
        return Promise.resolve(note(ref.id))
      },
      revive: (snapshot) => {
        const path = (snapshot as { path?: string }).path
        if (path == null || !vault.has(path)) return Promise.resolve(objectGone)
        return Promise.resolve(note(path))
      },
      label: (object) => ({ title: object.title, subtitle: String(object.props.path) }),
    },
    ...extra,
  } as TabType
}

function logsType(extra: Partial<TabType> = {}): TabType {
  return { id: 'logs', icon: 'lu:list', title: 'Logs', order: 90, pinned: false, content: LogsView, ...extra } as TabType
}

function settingsType(): TabType {
  return { id: 'settings', icon: 'lu:settings', title: 'Settings', order: 50, content: LogsView } as TabType
}

interface Recorded {
  event: keyof WorkspaceEvents
  payload: unknown
}

interface Built {
  workspace: Workspace
  registry: TabTypeRegistry
  log: Recorded[]
}

function build(...types: TabType[]): Built {
  const registry = new TabTypeRegistry()
  for (const type of types) registry.register(type)
  const log: Recorded[] = []
  const workspace = new Workspace({
    types: registry,
    createPanels: () => new FakePanelHost(),
    emit: (event, payload) => {
      log.push({ event, payload })
    },
  })
  return { workspace, registry, log }
}

function hostOf(workspace: Workspace, typeId: string): FakePanelHost {
  return workspace.panelsOf(typeId) as FakePanelHost
}

beforeEach(() => {
  vault = new Set(['a.md', 'b.md', 'c.md'])
  openCalls = []
})

test('closing waits for the object save, and repeated requests join it', async () => {
  const { workspace, log } = build(notesType())
  await workspace.openObject('notes', { id: 'a.md' })
  const object = workspace.objectOf('notes', 'note:a.md')!
  let complete: (saved: boolean) => void = () => {}
  object.beforeClose = () =>
    new Promise<boolean>((resolve) => {
      complete = resolve
    })
  const closing = workspace.closeObject('notes', object.key)
  expect(workspace.closeObject('notes', object.key)).toBe(closing)
  await Promise.resolve()
  expect(workspace.tabsOf('notes')).toHaveLength(1)
  expect(log.some((entry) => entry.event === 'workspace:object-closed')).toBe(false)
  complete(true)
  await closing
  expect(workspace.tabsOf('notes')).toHaveLength(0)
})

test('a refused or failed save keeps the object open; explicit replacement can discard it', async () => {
  const { workspace } = build(notesType())
  await workspace.openObject('notes', { id: 'a.md' })
  const object = workspace.objectOf('notes', 'note:a.md')!
  object.beforeClose = async () => false
  await workspace.closeObject('notes', object.key)
  expect(workspace.tabsOf('notes')).toHaveLength(1)
  object.beforeClose = async () => {
    throw new Error('offline')
  }
  await workspace.closeObject('notes', object.key)
  expect(workspace.serialize().types[0].tabs).toHaveLength(1)
  workspace.closeObject('notes', object.key, { discard: true })
  expect(workspace.tabsOf('notes')).toHaveLength(0)
})

test('retargeting over another open object removes its superseded buffer without saving it', async () => {
  const { workspace } = build(notesType())
  await workspace.openObject('notes', { id: 'a.md' })
  await workspace.openObject('notes', { id: 'b.md' })
  const source = workspace.objectOf('notes', 'note:a.md')!
  const target = workspace.objectOf('notes', 'note:b.md')!
  let saves = 0
  target.beforeClose = async () => {
    saves++
    return true
  }
  workspace.replaceObject('notes', source.key, { ...source, key: target.key })
  expect(hostOf(workspace, 'notes').keys()).toEqual([target.key])
  await Promise.resolve()
  expect(saves).toBe(0)
})

describe('Workspace: panels it did not open itself', () => {
  // Every opener in the application still writes straight to the panel store (the second half of
  // F-21/F-22), so a type's host legitimately holds tabs the workspace has no object for. A list of
  // what is open that silently omitted them would be worse than no list.
  test('lists and counts a panel the host holds but the workspace never opened', async () => {
    const { workspace } = build(notesType())
    workspace.activateType('notes')
    hostOf(workspace, 'notes').open({ key: 'welcome', title: 'Welcome', component: NoteView, props: {} })

    expect(workspace.tabsOf('notes').map((it) => ({ key: it.key, title: it.title }))).toEqual([{ key: 'welcome', title: 'Welcome' }])
    expect(workspace.row.value.find((it) => it.type.id === 'notes')?.count).toBe(1)
    // Its title is whatever the host is showing: there is no type-side object to ask `label()` about,
    // so an adopted tab has no subtitle rather than a made-up one.
    expect(workspace.tabsOf('notes')[0].subtitle).toBeUndefined()
  })

  test('activating and closing an adopted panel goes through the same two operations', () => {
    const { workspace } = build(notesType())
    workspace.activateType('notes')
    const host = hostOf(workspace, 'notes')
    host.open({ key: 'welcome', title: 'Welcome', component: NoteView, props: {} })
    host.open({ key: 'console', title: 'SQL console', component: NoteView, props: {} })

    workspace.activateObject('notes', 'welcome')
    expect(workspace.activeTab('notes')?.key).toBe('welcome')

    workspace.closeObject('notes', 'welcome')
    expect(workspace.tabsOf('notes').map((it) => it.key)).toEqual(['console'])
  })

  // The workspace record is what the type raised, and an adopted panel has no snapshot to write down —
  // the panels plugin's own record is what carries those. Two records, one desk, and neither of them
  // claiming the other's rows.
  test('an adopted panel is not written into the workspace snapshot', async () => {
    const { workspace } = build(notesType())
    await workspace.openObject('notes', { id: 'a.md' })
    hostOf(workspace, 'notes').open({ key: 'welcome', title: 'Welcome', component: NoteView, props: {} })

    const state = workspace.serialize()
    expect(state.types.find((it) => it.id === 'notes')?.tabs.map((it) => it.key)).toEqual(['note:a.md'])
  })
})

describe('Workspace: the level above panel groups', () => {
  test('the row holds the pinned types even before anyone has entered them', () => {
    const { workspace } = build(notesType(), settingsType(), logsType())

    expect(workspace.row.value.map((it) => it.type.id)).toEqual(['notes', 'settings'])
    expect(workspace.activeTypeId.value).toBeNull()
  })

  test('an unpinned type stands in the row while it is open and leaves it when closed', () => {
    const { workspace } = build(notesType(), logsType())

    workspace.activateType('logs')
    expect(workspace.row.value.map((it) => it.type.id)).toEqual(['notes', 'logs'])
    expect(workspace.activeTypeId.value).toBe('logs')

    workspace.closeType('logs')
    expect(workspace.row.value.map((it) => it.type.id)).toEqual(['notes'])
  })

  test('each object type gets its own host — one type’s tabs are not visible in another', async () => {
    const { workspace } = build(notesType(), { ...notesType(), id: 'tasks', title: 'Tasks', order: 20 } as TabType)

    await workspace.openObject('notes', { id: 'a.md' })
    await workspace.openObject('tasks', { id: 'b.md' })

    const notes = workspace.panelsOf('notes')
    const tasks = workspace.panelsOf('tasks')
    expect(notes).toBeDefined()
    expect(notes).not.toBe(tasks)
    expect(notes?.keys()).toEqual(['note:a.md'])
    expect(tasks?.keys()).toEqual(['note:b.md'])
  })

  test('a type without objects opens no host at all', () => {
    const { workspace } = build(settingsType())
    workspace.activateType('settings')

    expect(workspace.spaceOf('settings')?.kind).toBe('content')
    expect(workspace.panelsOf('settings')).toBeUndefined()
    expect(workspace.tabsOf('settings')).toEqual([])
  })

  test('opening an object switches to its type and makes the tab active', async () => {
    const { workspace } = build(notesType(), settingsType())
    workspace.activateType('settings')

    const tab = await workspace.openObject('notes', { id: 'a.md' })

    expect(tab?.key).toBe('note:a.md')
    expect(workspace.activeTypeId.value).toBe('notes')
    expect(workspace.activeTab()?.key).toBe('note:a.md')
    expect(workspace.tabsOf('notes').map((it) => it.title)).toEqual(['a.md'])
  })
})

describe('Workspace.openObject: the de-duplication lives here and nowhere else', () => {
  test('opening the same object again switches to it instead of making a second tab', async () => {
    const { workspace } = build(notesType())

    await workspace.openObject('notes', { id: 'a.md' })
    await workspace.openObject('notes', { id: 'b.md' })
    await workspace.openObject('notes', { id: 'a.md', at: 'block-7' })

    expect(workspace.tabsOf('notes').map((it) => it.key)).toEqual(['note:a.md', 'note:b.md'])
    expect(workspace.activeTab()?.key).toBe('note:a.md')
    // The type still learns about the repeat open — that is how it reveals the right place inside an
    // object that is already open. Workspace only refuses it a second tab.
    expect(openCalls.map((it) => it.at)).toEqual([undefined, undefined, 'block-7'])
  })

  test('a caller never has to ask whether an object is open: both entry points give the same tab', async () => {
    const { workspace } = build(notesType())

    const first = await workspace.openObject('notes', { id: 'a.md' })
    await workspace.openObject('notes', { id: 'b.md' })
    const again = await workspace.openObject('notes', { id: 'a.md' })

    expect(again?.key).toBe(first?.key)
    expect(workspace.tabsOf('notes')).toHaveLength(2)
  })

  test('a repeat open does not move the tab: it activates the one already in place', async () => {
    const { workspace } = build(notesType())
    await workspace.openObject('notes', { id: 'a.md' })
    await workspace.openObject('notes', { id: 'b.md' })
    await workspace.openObject('notes', { id: 'c.md' })

    await workspace.openObject('notes', { id: 'a.md' })

    expect(hostOf(workspace, 'notes').keys()).toEqual(['note:a.md', 'note:b.md', 'note:c.md'])
    expect(workspace.activeTab()?.key).toBe('note:a.md')
  })

  test('opening announces "opened" once and "activated" every time', async () => {
    const { workspace, log } = build(notesType())

    await workspace.openObject('notes', { id: 'a.md' })
    await workspace.openObject('notes', { id: 'a.md' })

    expect(log.filter((it) => it.event === 'workspace:object-opened')).toHaveLength(1)
    expect(log.filter((it) => it.event === 'workspace:object-activated')).toHaveLength(2)
  })

  test('an object cannot be opened in a type without objects, nor in a type that is not registered', async () => {
    const { workspace } = build(settingsType())
    expect(await workspace.openObject('settings', { id: 'nothing to open' })).toBeNull()
    expect(await workspace.openObject('no such type', { id: 'a.md' })).toBeNull()
  })

  test('a failed open leaves the person where they were', async () => {
    const failing = {
      ...notesType(),
      id: 'remote',
      title: 'Remote',
      order: 20,
      objects: {
        open: () => Promise.reject(new Error('the store is unreachable')),
        revive: () => Promise.resolve(objectGone),
        label: (object: OpenedObject) => ({ title: object.title }),
      },
    } as TabType
    const { workspace } = build(notesType(), failing)
    await workspace.openObject('notes', { id: 'a.md' })

    await expect(workspace.openObject('remote', { id: 'x' })).rejects.toThrow('the store is unreachable')

    expect(workspace.activeTypeId.value).toBe('notes')
    expect(workspace.spaceOf('remote')).toBeUndefined()
  })
})

describe('Workspace: switching, closing and the row', () => {
  test('closing a tab keeps you in its type and hands the activity to the neighbour', async () => {
    const { workspace } = build(notesType())
    await workspace.openObject('notes', { id: 'a.md' })
    await workspace.openObject('notes', { id: 'b.md' })

    workspace.closeObject('notes', 'note:b.md')

    expect(workspace.activeTypeId.value).toBe('notes')
    expect(workspace.tabsOf('notes').map((it) => it.key)).toEqual(['note:a.md'])
    expect(workspace.activeTab()?.key).toBe('note:a.md')
  })

  test('closing the last tab does not throw you out of the type', async () => {
    const { workspace } = build(notesType())
    await workspace.openObject('notes', { id: 'a.md' })

    workspace.closeObject('notes', 'note:a.md')

    expect(workspace.activeTypeId.value).toBe('notes')
    expect(workspace.tabsOf('notes')).toEqual([])
    expect(workspace.activeTab()).toBeNull()
  })

  test('switching types brings back the tab that was active in each', async () => {
    const { workspace } = build(notesType(), settingsType())
    await workspace.openObject('notes', { id: 'a.md' })
    await workspace.openObject('notes', { id: 'b.md' })
    workspace.activateObject('notes', 'note:a.md')

    workspace.activateType('settings')
    expect(workspace.activeTab()).toBeNull()

    workspace.activateType('notes')
    expect(workspace.activeTab()?.key).toBe('note:a.md')
  })

  test('switching to an open tab restores its type too', async () => {
    const { workspace } = build(notesType(), settingsType())
    await workspace.openObject('notes', { id: 'a.md' })
    workspace.activateType('settings')

    workspace.activateObject('notes', 'note:a.md')

    expect(workspace.activeTypeId.value).toBe('notes')
    expect(workspace.activeTab()?.key).toBe('note:a.md')
  })

  test('a tab that is not open is not activated, and the current type is not disturbed', async () => {
    const { workspace } = build(notesType(), settingsType())
    await workspace.openObject('notes', { id: 'a.md' })
    workspace.activateType('settings')

    workspace.activateObject('notes', 'note:never-opened')

    expect(workspace.activeTypeId.value).toBe('settings')
  })

  test('the counter counts tabs, and a declared count wins — a player’s queue is not its tabs', async () => {
    const player = {
      ...notesType(),
      id: 'player',
      title: 'Player',
      order: 30,
      open: { title: 'Queue', count: () => 40 },
    } as TabType
    const { workspace } = build(notesType(), player, settingsType())

    await workspace.openObject('notes', { id: 'a.md' })
    await workspace.openObject('player', { id: 'track-1' })

    const row = Object.fromEntries(workspace.row.value.map((it) => [it.type.id, it.count]))
    expect(row.notes).toBe(1)
    expect(row.player).toBe(40)
    // The "what is open" role was never declared — no counter, and no second level.
    expect(row.settings).toBe(0)
  })

  test('the dock is declared by the type and filled by the active object', async () => {
    const { workspace } = build(notesType(), settingsType())

    workspace.activateType('notes')
    expect(workspace.dock()).toBe(NotesDock)

    await workspace.openObject('notes', { id: 'a.md' })
    expect(workspace.dock()).toBe(ObjectDock)

    // A type that never declared a dock gets no band above the row.
    workspace.activateType('settings')
    expect(workspace.dock()).toBeNull()
  })

  test('a tab’s label comes from the type: label knows more about the object than a title does', async () => {
    const { workspace } = build(notesType())
    await workspace.openObject('notes', { id: 'a.md' })

    expect(workspace.tabsOf('notes')[0]).toMatchObject({ title: 'a.md', subtitle: 'a.md' })
  })

  test('closing a type takes its tabs with it and hands the activity to another open type', async () => {
    const { workspace } = build(notesType(), settingsType())
    await workspace.openObject('notes', { id: 'a.md' })
    workspace.activateType('settings')

    workspace.closeType('settings')

    expect(workspace.activeTypeId.value).toBe('notes')
    expect(workspace.spaceOf('settings')).toBeUndefined()
    expect(workspace.tabsOf('notes')).toHaveLength(1)
  })

  test('what happens is announced — this is what workspace persistence will subscribe to', async () => {
    const { workspace, log } = build(notesType(), settingsType())

    workspace.activateType('notes')
    await workspace.openObject('notes', { id: 'a.md' })
    workspace.closeObject('notes', 'note:a.md')
    workspace.closeType('notes')

    expect(log.map((it) => it.event)).toEqual([
      'workspace:type-opened',
      'workspace:type-activated',
      'workspace:object-opened',
      'workspace:object-activated',
      'workspace:object-closed',
      'workspace:type-closed',
    ])
    expect(log[2].payload).toEqual({ typeId: 'notes', key: 'note:a.md' })
  })

  test('a workspace with no listener is still a workspace: emit is optional', async () => {
    const registry = new TabTypeRegistry()
    registry.register(notesType())
    const workspace = new Workspace({ types: registry, createPanels: () => new FakePanelHost() })

    await workspace.openObject('notes', { id: 'a.md' })

    expect(workspace.activeTab()?.key).toBe('note:a.md')
  })
})

describe('Workspace: restoring the desk', () => {
  test('the snapshot writes the types, their order, their tabs and each type’s active tab', async () => {
    const { workspace } = build(notesType(), settingsType())
    await workspace.openObject('notes', { id: 'a.md' })
    await workspace.openObject('notes', { id: 'b.md' })
    workspace.activateObject('notes', 'note:a.md')
    workspace.activateType('settings')

    expect(workspace.serialize()).toEqual({
      activeTypeId: 'settings',
      types: [
        {
          id: 'notes',
          activeKey: 'note:a.md',
          tabs: [
            { key: 'note:a.md', title: 'a.md', object: { path: 'a.md' } },
            { key: 'note:b.md', title: 'b.md', object: { path: 'b.md' } },
          ],
        },
        { id: 'settings', activeKey: null, tabs: [] },
      ],
    })
  })

  test('restoring gives the desk back: the same tabs, the same active one in each type, the same active type', async () => {
    const first = build(notesType(), settingsType())
    await first.workspace.openObject('notes', { id: 'a.md' })
    await first.workspace.openObject('notes', { id: 'b.md' })
    first.workspace.activateObject('notes', 'note:a.md')
    const state = first.workspace.serialize()

    const second = build(notesType(), settingsType())
    await second.workspace.restore(state)

    expect(second.workspace.activeTypeId.value).toBe('notes')
    expect(second.workspace.tabsOf('notes').map((it) => it.key)).toEqual(['note:a.md', 'note:b.md'])
    expect(second.workspace.activeTab()?.key).toBe('note:a.md')
  })

  test('the layout is carried through untouched and applied after every tab is raised', async () => {
    const first = build(notesType())
    await first.workspace.openObject('notes', { id: 'a.md' })
    await first.workspace.openObject('notes', { id: 'b.md' })
    hostOf(first.workspace, 'notes').applyLayout({ split: 'horizontal', ratio: 0.5 })

    const state = first.workspace.serialize()
    expect(state.types[0].layout).toEqual({ split: 'horizontal', ratio: 0.5 })

    const second = build(notesType())
    await second.workspace.restore(state)

    const host = hostOf(second.workspace, 'notes')
    expect(host.serializeLayout()).toEqual({ split: 'horizontal', ratio: 0.5 })
    // Applied last: the layout only arranges tabs, it never creates or removes one.
    expect(host.keys()).toEqual(['note:a.md', 'note:b.md'])
  })

  test('a single-cell layout says nothing, so the field does not appear in the snapshot', async () => {
    const { workspace } = build(notesType())
    await workspace.openObject('notes', { id: 'a.md' })

    expect(workspace.serialize().types[0]).not.toHaveProperty('layout')
  })
})

describe('Workspace: an object that is gone', () => {
  test('a tab whose object is gone stays and is marked — it does not vanish silently', async () => {
    const first = build(notesType())
    await first.workspace.openObject('notes', { id: 'a.md' })
    await first.workspace.openObject('notes', { id: 'b.md' })
    const state = first.workspace.serialize()

    vault.delete('b.md')
    const second = build(notesType())
    await second.workspace.restore(state)

    const tabs = second.workspace.tabsOf('notes')
    expect(tabs.map((it) => it.key)).toEqual(['note:a.md', 'note:b.md'])
    expect(tabs.map((it) => it.gone)).toEqual([false, true])
    expect(second.workspace.isGone('notes', 'note:b.md')).toBe(true)
    expect(second.log.filter((it) => it.event === 'workspace:object-gone')).toHaveLength(1)
  })

  test('a marked tab shows the gone view, with a way to close itself', async () => {
    const first = build(notesType())
    await first.workspace.openObject('notes', { id: 'b.md' })
    const state = first.workspace.serialize()

    vault.delete('b.md')
    const second = build(notesType())
    await second.workspace.restore(state)

    const panel = hostOf(second.workspace, 'notes').panel('note:b.md')
    expect(panel?.component).not.toBe(NoteView)
    expect(panel?.props.title).toBe('b.md')
    ;(panel?.props.onClose as () => void)()
    expect(second.workspace.tabsOf('notes')).toEqual([])
  })

  test('a revive that throws is treated as gone, not as a failed start-up', async () => {
    const throwing = {
      ...notesType(),
      objects: {
        open: (ref: { id: string }) => Promise.resolve(note(ref.id)),
        revive: () => Promise.reject(new Error('the store is unreachable')),
        label: (object: OpenedObject) => ({ title: object.title }),
      },
    } as TabType
    const { workspace } = build(throwing)

    await workspace.restore({
      activeTypeId: 'notes',
      types: [{ id: 'notes', activeKey: null, tabs: [{ key: 'note:a.md', title: 'a.md', object: { path: 'a.md' } }] }],
    })

    expect(workspace.tabsOf('notes').map((it) => it.gone)).toEqual([true])
  })

  test('a marked tab keeps its snapshot: until the person decides, it survives the next start-up too', async () => {
    const first = build(notesType())
    await first.workspace.openObject('notes', { id: 'b.md' })
    const state = first.workspace.serialize()

    vault.delete('b.md')
    const second = build(notesType())
    await second.workspace.restore(state)

    expect(second.workspace.serialize()).toEqual(state)
  })

  test('a marked tab takes its label from the saved title, not from the type', async () => {
    const first = build(notesType())
    await first.workspace.openObject('notes', { id: 'b.md' })
    const state = first.workspace.serialize()

    vault.delete('b.md')
    const second = build(notesType())
    await second.workspace.restore(state)

    expect(second.workspace.tabsOf('notes')[0]).toMatchObject({ title: 'b.md', subtitle: undefined })
  })

  test('the object came back — the mark is dropped and the tab stays where it was', async () => {
    const first = build(notesType())
    await first.workspace.openObject('notes', { id: 'a.md' })
    await first.workspace.openObject('notes', { id: 'b.md' })
    await first.workspace.openObject('notes', { id: 'c.md' })
    const state = first.workspace.serialize()

    vault.delete('b.md')
    const second = build(notesType())
    await second.workspace.restore(state)
    expect(second.workspace.isGone('notes', 'note:b.md')).toBe(true)

    // The file was created again, and the person opens it from the search sheet.
    vault.add('b.md')
    await second.workspace.openObject('notes', { id: 'b.md' })

    expect(second.workspace.isGone('notes', 'note:b.md')).toBe(false)
    expect(second.workspace.tabsOf('notes').map((it) => it.gone)).toEqual([false, false, false])
    // The order did not shift: a tab does not move to the end of the row because it was repaired.
    expect(second.workspace.tabsOf('notes').map((it) => it.key)).toEqual(['note:a.md', 'note:b.md', 'note:c.md'])
    // And what is on screen is the object again, not the message about its disappearance.
    expect(hostOf(second.workspace, 'notes').panel('note:b.md')?.component).toBe(NoteView)
  })

  test('closing drops the mark along with the tab', async () => {
    const first = build(notesType())
    await first.workspace.openObject('notes', { id: 'b.md' })
    const state = first.workspace.serialize()

    vault.delete('b.md')
    const second = build(notesType())
    await second.workspace.restore(state)
    second.workspace.closeObject('notes', 'note:b.md')

    expect(second.workspace.isGone('notes', 'note:b.md')).toBe(false)
    expect(second.workspace.tabsOf('notes')).toEqual([])
  })

  test('closing a type drops the marks of its tabs, and does not touch another type’s', async () => {
    const tasks = { ...notesType(), id: 'tasks', title: 'Tasks', order: 20 } as TabType
    const first = build(notesType(), tasks)
    await first.workspace.openObject('notes', { id: 'b.md' })
    await first.workspace.openObject('tasks', { id: 'b.md' })
    const state = first.workspace.serialize()

    vault.delete('b.md')
    const second = build(notesType(), tasks)
    await second.workspace.restore(state)
    second.workspace.closeType('notes')

    expect(second.workspace.isGone('notes', 'note:b.md')).toBe(false)
    expect(second.workspace.isGone('tasks', 'note:b.md')).toBe(true)
  })
})

describe('Workspace: what arrives from disk is data, not an order', () => {
  test('an unknown type and a tab with no key are dropped one by one', async () => {
    const { workspace } = build(notesType())

    await workspace.restore({
      activeTypeId: 'a type that is gone',
      types: [
        { id: 'a type that is gone', activeKey: null, tabs: [{ key: 'x', title: 'x', object: null }] },
        { id: 'notes', activeKey: 'note:a.md', tabs: [{ key: 'note:a.md', title: 'a.md', object: { path: 'a.md' } }] },
      ],
    })

    expect(workspace.row.value.map((it) => it.type.id)).toEqual(['notes'])
    expect(workspace.activeTypeId.value).toBe('notes')
    expect(workspace.tabsOf('notes')).toHaveLength(1)
  })

  test('restoring raises no layer: only what was written is restored', async () => {
    const { workspace } = build(notesType(), logsType())
    // Logs is not in the snapshot — so it must not be in the row, however reachable it may be.
    await workspace.restore({ activeTypeId: 'notes', types: [{ id: 'notes', activeKey: null, tabs: [] }] })

    expect(workspace.row.value.map((it) => it.type.id)).toEqual(['notes'])
  })

  test('an active key naming a tab that did not come back is ignored, and the type keeps a live active tab', async () => {
    const { workspace } = build(notesType())

    await workspace.restore({
      activeTypeId: 'notes',
      types: [{ id: 'notes', activeKey: 'note:never-opened', tabs: [{ key: 'note:a.md', title: 'a.md', object: { path: 'a.md' } }] }],
    })

    expect(workspace.tabsOf('notes')).toHaveLength(1)
    expect(workspace.activeTab()?.key).toBe('note:a.md')
  })

  test('the object snapshot comes from the object itself — Workspace never looks inside it', async () => {
    const { workspace } = build(notesType())
    await workspace.openObject('notes', { id: 'a.md' })

    const state = workspace.serialize()
    const tab = state.types[0].tabs[0]
    expect(tab.object).toEqual({ path: 'a.md' } satisfies Json)
  })

  test('restore starts from a clean desk: a second restore does not add to the first', async () => {
    const { workspace } = build(notesType(), settingsType())
    await workspace.openObject('notes', { id: 'a.md' })
    await workspace.openObject('notes', { id: 'b.md' })

    await workspace.restore({ activeTypeId: 'settings', types: [{ id: 'settings', activeKey: null, tabs: [] }] })

    expect(workspace.openTypeIds.value).toEqual(['settings'])
    expect(workspace.tabsOf('notes')).toEqual([])
  })
})
