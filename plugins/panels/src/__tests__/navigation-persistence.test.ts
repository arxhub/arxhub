import { createEventBus } from '@arxhub/events'
import { ConsoleLogger } from '@arxhub/logger'
import { objectGone, TabTypeRegistry, Workspace, WorkspaceStorage } from '@arxhub/plugin-shell'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { restoreNavigationWorkspace } from '../navigation-persistence'
import { StorePanelHost } from '../panel-host'
import { PanelStoreExtension } from '../panel-store-extension'

const View = defineComponent({})
let values: Map<string, string>

beforeEach(() => {
  values = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

function build(missing = new Set<string>()) {
  const panels = new PanelStoreExtension({ logger: new ConsoleLogger(), bus: createEventBus() })
  panels.store.registerPanel({ id: 'welcome', title: 'Welcome', component: View })
  const types = new TabTypeRegistry()
  const open = async ({ id }: { id: string }) => ({ key: id, title: id, component: View, props: { path: id }, snapshot: () => ({ path: id }) })
  types.register({
    id: 'notes',
    title: 'Notes',
    icon: 'lu:file-text',
    open: { title: 'Open notes' },
    objects: {
      open,
      revive: async (snapshot) => {
        const path = (snapshot as { path: string }).path
        return missing.has(path) ? objectGone : open({ id: path })
      },
      label: (object) => ({ title: object.title }),
    },
  })
  const workspace = new Workspace({
    types,
    createPanels: () => new StorePanelHost(panels.store),
    emit: (event, payload) => storage.observe(event, payload),
  })
  const storage = new WorkspaceStorage({ workspace })
  return { panels, workspace, storage }
}

function seed() {
  const legacy = {
    groups: {
      left: {
        id: 'left',
        instances: [
          { instanceId: 'welcome-id', definitionId: 'welcome', title: 'Welcome', props: {} },
          { instanceId: 'old-a', definitionId: 'editor', title: 'a.md', props: { path: 'a.md' } },
        ],
        activeInstanceId: 'old-a',
      },
      right: {
        id: 'right',
        instances: [{ instanceId: 'old-b', definitionId: 'editor', title: 'b.md', props: { path: 'b.md' } }],
        activeInstanceId: 'old-b',
      },
    },
    layout: {
      type: 'split',
      splitId: 'split',
      direction: 'horizontal',
      ratio: 0.3,
      first: { type: 'leaf', groupId: 'left' },
      second: { type: 'leaf', groupId: 'right' },
    },
    activeGroupId: 'right',
  }
  values.set('arxhub.panels.workspace', JSON.stringify(legacy))
  values.set(
    'arxhub.workspace',
    JSON.stringify({ v: 1, workspace: { activeTypeId: 'notes', types: [{ id: 'notes', activeKey: 'old-b', tabs: [] }] }, nav: {}, column: {} }),
  )
  return JSON.stringify(legacy)
}

test('migration retains files, active document, split ratio and the legacy rollback copy', async () => {
  const legacy = seed()
  const { panels, workspace, storage } = build()
  await restoreNavigationWorkspace(panels, workspace, storage, 'notes')
  expect(
    workspace
      .tabsOf('notes')
      .map((tab) => tab.key)
      .sort(),
  ).toEqual(['a.md', 'b.md', 'welcome-id'])
  expect(workspace.activeTab()?.key).toBe('b.md')
  expect(panels.store.layout.value).toMatchObject({ type: 'split', ratio: 0.3 })
  expect(values.get('arxhub.panels.workspace')).toBe(legacy)
  const snapshot = workspace.serialize().types[0]
  expect(snapshot.tabs.map((tab) => tab.object)).toEqual([{ path: 'a.md' }, { path: 'b.md' }])
})

test('closing a migrated document survives another boot without resurrecting the old record', async () => {
  seed()
  const first = build()
  await restoreNavigationWorkspace(first.panels, first.workspace, first.storage, 'notes')
  first.workspace.closeObject('notes', 'a.md')
  await nextTick()
  const second = build(new Set(['b.md']))
  await restoreNavigationWorkspace(second.panels, second.workspace, second.storage, 'notes')
  expect(
    second.workspace
      .tabsOf('notes')
      .map((tab) => tab.key)
      .sort(),
  ).toEqual(['b.md', 'welcome-id'])
  expect(second.workspace.isGone('notes', 'b.md')).toBe(true)
})

test('an invalid utility record cannot prevent document restoration', async () => {
  values.set('arxhub.panels.migrated', '1')
  values.set('arxhub.panels.utilities', '{"groups":null}')
  values.set(
    'arxhub.workspace',
    JSON.stringify({
      v: 1,
      workspace: {
        activeTypeId: 'notes',
        types: [{ id: 'notes', activeKey: 'a.md', tabs: [{ key: 'a.md', title: 'a.md', object: { path: 'a.md' } }] }],
      },
    }),
  )
  const { panels, workspace, storage } = build()
  await restoreNavigationWorkspace(panels, workspace, storage, 'notes')
  expect(workspace.activeTab()?.key).toBe('a.md')
})
