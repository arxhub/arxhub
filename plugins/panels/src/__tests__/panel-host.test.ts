import { createEventBus, type EventMap } from '@arxhub/events'
import type { HostedPanel, ObjectRef, OpenedObject, TabType } from '@arxhub/plugin-shell/ui'
import { TabTypeRegistry, Workspace } from '@arxhub/plugin-shell/ui'
import { beforeEach, describe, expect, test } from 'vitest'
import { type Component, defineComponent } from 'vue'
import { StorePanelHost } from '../panel-host'
import { createPanelStore } from '../panel-store'
import type { PanelStore } from '../types'

// The panels half of the navigation model: one store per type behind the shell's `PanelHost` port.
// What is checked here is the seam the port describes — a key reaches its panel in its group, and two
// types never see each other's tabs — plus the layout rules the port carries as opaque `Json`.

const NoteView = defineComponent({ name: 'note' })
const GoneView = defineComponent({ name: 'gone' })

function newHost(): StorePanelHost {
  return new StorePanelHost(createPanelStore(createEventBus<EventMap>()))
}

function panel(key: string, component: Component = NoteView): HostedPanel {
  return { key, title: key, component, props: { id: key } }
}

let host: StorePanelHost
let store: PanelStore

beforeEach(() => {
  host = newHost()
  store = host.store
})

describe('one type, one host', () => {
  test('an opened panel is open, active and listed', () => {
    host.open(panel('a'))

    expect(host.keys()).toEqual(['a'])
    expect(host.has('a')).toBe(true)
    expect(host.activeKey()).toBe('a')
  })

  test('opening an open key switches to it instead of opening a second tab', () => {
    host.open(panel('a'))
    host.open(panel('b'))

    host.open(panel('a'))

    expect(host.keys()).toEqual(['a', 'b'])
    expect(host.activeKey()).toBe('a')
  })

  test('replace swaps what a tab shows without moving it', () => {
    host.open(panel('a'))
    host.open(panel('b'))
    host.open(panel('c'))

    host.replace('b', { key: 'b', title: 'b is gone', component: GoneView, props: { id: 'b' } })

    expect(host.keys()).toEqual(['a', 'b', 'c'])
    const group = store.groups.value[store.activeGroupId.value as string]
    const instance = group.instances[1]
    expect(instance.title).toBe('b is gone')
    expect(instance.props?.component).toBe(GoneView)
  })

  test('closing the active tab activates its neighbour', () => {
    host.open(panel('a'))
    host.open(panel('b'))

    host.close('b')

    expect(host.keys()).toEqual(['a'])
    expect(host.activeKey()).toBe('a')
  })

  test('closing the last tab leaves nothing active', () => {
    host.open(panel('a'))

    host.close('a')

    expect(host.keys()).toEqual([])
    expect(host.activeKey()).toBeNull()
  })

  test('an unknown key is a no-op rather than a throw', () => {
    host.open(panel('a'))

    host.activate('nope')
    host.replace('nope', panel('nope'))
    host.close('nope')

    expect(host.keys()).toEqual(['a'])
    expect(host.activeKey()).toBe('a')
  })
})

describe('splitting still works inside a type', () => {
  // Two cells of one type: a and b in the first, c in the second.
  function split(): void {
    host.open(panel('a'))
    host.open(panel('b'))
    store.splitGroup(store.activeGroupId.value as string, 'horizontal')
    host.open(panel('c'))
  }

  test('a split puts the new panel in the new cell and leaves the old one alone', () => {
    split()

    expect(store.getOrderedGroupIds()).toHaveLength(2)
    expect(host.keys()).toEqual(['a', 'b', 'c'])
    expect(host.activeKey()).toBe('c')
  })

  test('activate reaches a panel in the cell that is not active, and brings that cell forward', () => {
    split()
    const [first, second] = store.getOrderedGroupIds()
    expect(store.activeGroupId.value).toBe(second)

    host.activate('a')

    expect(store.activeGroupId.value).toBe(first)
    expect(store.groups.value[first].activeInstanceId).toBe(store.groups.value[first].instances[0].instanceId)
    expect(host.activeKey()).toBe('a')
  })

  test('a layout is written as keys and restored into the same cells', () => {
    split()
    const snapshot = host.serializeLayout()
    expect(snapshot).toEqual({ d: 'h', r: 0.5, a: { keys: ['a', 'b'], active: 'b' }, b: { keys: ['c'], active: 'c' } })

    const restored = newHost()
    restored.open(panel('a'))
    restored.open(panel('b'))
    restored.open(panel('c'))
    expect(restored.store.getOrderedGroupIds()).toHaveLength(1)

    restored.applyLayout(snapshot)

    const [first, second] = restored.store.getOrderedGroupIds()
    expect(restored.keys()).toEqual(['a', 'b', 'c'])
    expect(restored.store.groups.value[first].instances.map((it) => it.title)).toEqual(['a', 'b'])
    expect(restored.store.groups.value[second].instances.map((it) => it.title)).toEqual(['c'])
  })

  test('a single cell has no layout to write down', () => {
    host.open(panel('a'))
    host.open(panel('b'))

    expect(host.serializeLayout()).toBeNull()
  })

  test('a layout that makes no sense is dropped whole and the tabs stay', () => {
    host.open(panel('a'))
    host.open(panel('b'))

    host.applyLayout({ d: 'h', r: 'wide', a: { keys: ['a'] }, b: { keys: ['b'] } })

    expect(host.keys()).toEqual(['a', 'b'])
    expect(store.getOrderedGroupIds()).toHaveLength(1)
  })

  test('a key the layout does not mention lands in the first cell instead of getting lost', () => {
    split()
    const snapshot = host.serializeLayout()

    const restored = newHost()
    restored.open(panel('a'))
    restored.open(panel('b'))
    restored.open(panel('c'))
    restored.open(panel('d'))

    restored.applyLayout(snapshot)

    expect(restored.keys()).toEqual(['a', 'b', 'd', 'c'])
  })

  test('a key the layout mentions but nothing opened is not resurrected', () => {
    split()
    const snapshot = host.serializeLayout()

    const restored = newHost()
    restored.open(panel('a'))
    restored.open(panel('c'))

    restored.applyLayout(snapshot)

    expect(restored.keys()).toEqual(['a', 'c'])
  })
})

describe('two types', () => {
  test('tabs of one type do not appear in another', () => {
    const notes = newHost()
    const logs = newHost()

    notes.open(panel('note:a'))
    notes.open(panel('note:b'))
    logs.open(panel('log:1'))

    expect(notes.keys()).toEqual(['note:a', 'note:b'])
    expect(logs.keys()).toEqual(['log:1'])
    expect(notes.has('log:1')).toBe(false)
    expect(logs.has('note:a')).toBe(false)
  })

  test('a split in one type leaves the other with its single cell', () => {
    const notes = newHost()
    const logs = newHost()

    notes.open(panel('note:a'))
    notes.store.splitGroup(notes.store.activeGroupId.value as string, 'vertical')
    notes.open(panel('note:b'))
    logs.open(panel('log:1'))

    expect(notes.store.getOrderedGroupIds()).toHaveLength(2)
    expect(logs.store.getOrderedGroupIds()).toHaveLength(1)
  })
})

describe('under a Workspace', () => {
  // The type is the level above groups: `Workspace` holds one host per type and the active type, and
  // this is where the port's implementation and that map actually meet.
  function objectType(id: string): TabType {
    return {
      id,
      icon: 'lu:file-text',
      title: id,
      objects: {
        open: (ref: ObjectRef): Promise<OpenedObject> =>
          Promise.resolve({
            key: `${id}:${ref.id}`,
            title: ref.id,
            component: NoteView,
            props: { id: ref.id },
            snapshot: () => ({ path: ref.id }),
          }),
        revive: () => Promise.resolve({ gone: true } as const),
        label: (object: OpenedObject) => ({ title: object.title }),
      },
    }
  }

  function build(): Workspace {
    const registry = new TabTypeRegistry()
    registry.register(objectType('notes'))
    registry.register(objectType('logs'))
    return new Workspace({
      types: registry,
      createPanels: () => new StorePanelHost(createPanelStore(createEventBus<EventMap>())),
    })
  }

  test('each type keeps its own tabs', async () => {
    const workspace = build()

    await workspace.openObject('notes', { id: 'a.md' })
    await workspace.openObject('notes', { id: 'b.md' })
    await workspace.openObject('logs', { id: 'session' })

    expect(workspace.tabsOf('notes').map((it) => it.key)).toEqual(['notes:a.md', 'notes:b.md'])
    expect(workspace.tabsOf('logs').map((it) => it.key)).toEqual(['logs:session'])
  })

  test('switching the active type leaves each type its own active tab', async () => {
    const workspace = build()

    await workspace.openObject('notes', { id: 'a.md' })
    await workspace.openObject('notes', { id: 'b.md' })
    workspace.activateObject('notes', 'notes:a.md')
    await workspace.openObject('logs', { id: 'session' })

    expect(workspace.activeTypeId.value).toBe('logs')
    expect(workspace.activeTab()?.key).toBe('logs:session')

    workspace.activateType('notes')

    expect(workspace.activeTab()?.key).toBe('notes:a.md')
    expect(workspace.activeTab('logs')?.key).toBe('logs:session')
  })

  test('a split in one type survives switching away and back', async () => {
    const workspace = build()

    await workspace.openObject('notes', { id: 'a.md' })
    const notes = workspace.panelsOf('notes') as StorePanelHost
    notes.store.splitGroup(notes.store.activeGroupId.value as string, 'horizontal')
    await workspace.openObject('notes', { id: 'b.md' })
    await workspace.openObject('logs', { id: 'session' })

    workspace.activateType('notes')

    expect(notes.store.getOrderedGroupIds()).toHaveLength(2)
    expect(workspace.activeTab()?.key).toBe('notes:b.md')
  })
})
