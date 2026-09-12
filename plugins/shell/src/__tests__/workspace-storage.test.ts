import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Component } from 'vue'
import { type OpenedObject, objectGone, type TabType } from '../ui/tab-type'
import { TabTypeRegistry } from '../ui/tab-type-registry'
import { Workspace } from '../ui/workspace'
import {
  COLUMN_MAX,
  COLUMN_MIN,
  type StorageLike,
  WORKSPACE_BACKUP_KEY,
  WORKSPACE_KEY,
  WORKSPACE_VERSION,
  WorkspaceStorage,
} from '../ui/workspace-storage'
import { FakePanelHost } from './fake-panel-host'

const NoteView = { name: 'note' } as Component
const SettingsView = { name: 'settings' } as Component

// The fixture's note store: what is in it revives, everything else is gone.
let vault: Set<string>

class MemoryStorage implements StorageLike {
  readonly entries = new Map<string, string>()
  writes = 0

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.writes += 1
    this.entries.set(key, value)
  }

  removeItem(key: string): void {
    this.entries.delete(key)
  }
}

// Storage that refuses at every step: private mode, a sandbox, out of quota.
class BrokenStorage implements StorageLike {
  getItem(): string | null {
    throw new Error('storage disabled')
  }

  setItem(): void {
    throw new Error('storage disabled')
  }

  removeItem(): void {
    throw new Error('storage disabled')
  }
}

function note(id: string): OpenedObject {
  return { key: `note:${id}`, title: id, component: NoteView, props: { path: id }, snapshot: () => ({ path: id }) }
}

function notesType(): TabType {
  return {
    id: 'notes',
    icon: 'lu:file-text',
    title: 'Notes',
    order: 10,
    open: { title: 'Open notes' },
    objects: {
      open: (ref) => Promise.resolve(note(ref.id)),
      revive: (snapshot) => {
        const path = (snapshot as { path?: string }).path
        return Promise.resolve(path != null && vault.has(path) ? note(path) : objectGone)
      },
      label: (object) => ({ title: object.title }),
    },
  } as TabType
}

function settingsType(): TabType {
  return { id: 'settings', icon: 'lu:settings', title: 'Settings', order: 50, content: SettingsView } as TabType
}

interface Bench {
  workspace: Workspace
  storage: MemoryStorage
  saved: WorkspaceStorage
}

function build(storage: MemoryStorage = new MemoryStorage()): Bench {
  const registry = new TabTypeRegistry()
  registry.register(notesType())
  registry.register(settingsType())
  // The desk and the memory of it are a loop — the storage saves this workspace, the workspace
  // announces to the storage — so one of the two links is tied a line later. This is exactly the
  // wiring a composition root does.
  let saved: WorkspaceStorage
  const workspace = new Workspace({
    types: registry,
    createPanels: () => new FakePanelHost(),
    emit: (event, payload) => saved.observe(event, payload),
  })
  saved = new WorkspaceStorage({ workspace, storage })
  return { workspace, storage, saved }
}

function record(storage: MemoryStorage): Record<string, unknown> {
  return JSON.parse(storage.getItem(WORKSPACE_KEY) as string)
}

beforeEach(() => {
  vault = new Set(['a.md', 'b.md'])
})

describe('WorkspaceStorage: a subsystem of its own, not a field on something else', () => {
  test.each([{}, 'invalid', 12, null])('invalid tabs (%j) do not prevent restoring other types', async (tabs) => {
    const bench = build()
    bench.storage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({ v: WORKSPACE_VERSION, workspace: { activeTypeId: 'settings', types: [{ id: 'notes', tabs }, { id: 'settings' }] } }),
    )
    expect(await bench.saved.restore()).toBe(true)
    expect(bench.workspace.openTypeIds.value).toEqual(['notes', 'settings'])
    expect(bench.workspace.activeTypeId.value).toBe('settings')
    expect(bench.workspace.tabsOf('notes')).toEqual([])
  })

  test('a failed host restoration keeps the original record and allows a fresh workspace', async () => {
    const bench = build()
    await bench.workspace.openObject('notes', { id: 'a.md' })
    const original = bench.storage.getItem(WORKSPACE_KEY)
    const failingLayout = vi.spyOn(FakePanelHost.prototype, 'applyLayout').mockImplementationOnce(() => {
      throw new Error('invalid layout')
    })
    try {
      expect(await bench.saved.restore()).toBe(false)
      expect(bench.workspace.openTypeIds.value).toEqual([])
      expect(bench.storage.getItem(WORKSPACE_BACKUP_KEY)).toBe(original)
      expect(bench.storage.getItem(WORKSPACE_KEY)).toBe(original)
      await bench.workspace.openObject('notes', { id: 'b.md' })
      expect(bench.workspace.activeTab()?.key).toBe('note:b.md')
      expect(bench.saved.save()).toBe(true)
    } finally {
      failingLayout.mockRestore()
    }
  })

  test('the whole desk is one record under one key, not a scattering', async () => {
    const bench = build()
    await bench.workspace.openObject('notes', { id: 'a.md' })
    bench.saved.setNav('notes', { expanded: ['/'] })

    expect([...bench.storage.entries.keys()]).toEqual([WORKSPACE_KEY])
    expect(Object.keys(record(bench.storage)).sort()).toEqual(['column', 'nav', 'v', 'workspace'])
  })

  test('the record carries its version, and that is what a later build reads first', async () => {
    const bench = build()
    await bench.workspace.openObject('notes', { id: 'a.md' })

    expect(record(bench.storage).v).toBe(WORKSPACE_VERSION)
  })

  test('column geometry and navigation state do not overwrite each other — they have different owners', () => {
    const bench = build()

    bench.saved.setColumn('notes', { width: 320 })
    bench.saved.setNav('notes', { expanded: ['/', '/deals'] })
    bench.saved.setColumn('notes', { collapsed: true })

    // A plugin writes `nav` by replacing it — it is the owner and only it knows the shape inside. Had
    // the width lived there, this write would have carried it off.
    expect(bench.saved.columnOf('notes')).toEqual({ width: 320, collapsed: true })
    expect(bench.saved.navOf('notes')).toEqual({ expanded: ['/', '/deals'] })
  })

  test('the width is clamped on read, not only on write', async () => {
    const bench = build()
    bench.storage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({
        v: WORKSPACE_VERSION,
        workspace: { activeTypeId: null, types: [] },
        nav: {},
        // Came from a previous version of the app, from another monitor, or by hand from devtools.
        column: { notes: { width: -40 }, tasks: { width: 9999 }, broken: { width: 'wide' } },
      }),
    )

    await bench.saved.restore()

    expect(bench.saved.columnOf('notes').width).toBe(COLUMN_MIN)
    expect(bench.saved.columnOf('tasks').width).toBe(COLUMN_MAX)
    // Not a number at all — the field is simply absent, and the column takes its own default.
    expect(bench.saved.columnOf('broken').width).toBeUndefined()
  })
})

describe('WorkspaceStorage: every unit of a person’s work is written down', () => {
  test('opening a tab is already saved', async () => {
    const bench = build()
    expect(bench.storage.getItem(WORKSPACE_KEY)).toBeNull()

    await bench.workspace.openObject('notes', { id: 'a.md' })

    expect(record(bench.storage).workspace).toMatchObject({ activeTypeId: 'notes' })
    expect(bench.storage.writes).toBeGreaterThan(0)
  })

  test('closing a tab reaches the record too — coming back, the person does not see what they closed', async () => {
    const bench = build()
    await bench.workspace.openObject('notes', { id: 'a.md' })
    bench.workspace.closeObject('notes', 'note:a.md')

    const state = record(bench.storage).workspace as { types: Array<{ tabs: unknown[] }> }
    expect(state.types[0].tabs).toEqual([])
  })

  test('detaching stops the writing: after it an event records nothing', async () => {
    const bench = build()
    bench.saved.detach()

    await bench.workspace.openObject('notes', { id: 'a.md' })
    expect(bench.storage.getItem(WORKSPACE_KEY)).toBeNull()
  })
})

describe('WorkspaceStorage: giving the desk back', () => {
  test('the same tabs, the same active one, the same active type — and nothing is written while restoring', async () => {
    const storage = new MemoryStorage()
    const first = build(storage)
    await first.workspace.openObject('notes', { id: 'a.md' })
    await first.workspace.openObject('notes', { id: 'b.md' })
    first.workspace.activateObject('notes', 'note:a.md')

    const second = build(storage)
    storage.writes = 0
    expect(await second.saved.restore()).toBe(true)

    expect(second.workspace.tabsOf('notes').map((it) => it.key)).toEqual(['note:a.md', 'note:b.md'])
    expect(second.workspace.activeTab()?.key).toBe('note:a.md')
    expect(second.workspace.activeTypeId.value).toBe('notes')
    // A restore is not a person's work, and there is no point rewriting the record over it: half a
    // restored desk landing on disk is worse than the whole of it.
    expect(storage.writes).toBe(0)
  })

  test('an object that is gone comes back marked rather than vanishing, and the record remembers it', async () => {
    const storage = new MemoryStorage()
    const first = build(storage)
    await first.workspace.openObject('notes', { id: 'b.md' })

    vault.delete('b.md')
    const second = build(storage)
    await second.saved.restore()

    expect(second.workspace.isGone('notes', 'note:b.md')).toBe(true)
    expect(second.workspace.tabsOf('notes')).toHaveLength(1)
  })

  test('an empty storage is not an error, it is a first run', async () => {
    const bench = build()
    expect(await bench.saved.restore()).toBe(false)
  })
})

describe('WorkspaceStorage: what comes off the disk is data, not an order', () => {
  test('a record of another version is not taken apart: silently a clean slate', async () => {
    const storage = new MemoryStorage()
    storage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({
        v: WORKSPACE_VERSION + 1,
        workspace: {
          activeTypeId: 'notes',
          types: [{ id: 'notes', activeKey: null, tabs: [{ key: 'note:a.md', title: 'a.md', object: { path: 'a.md' } }] }],
        },
      }),
    )
    const bench = build(storage)

    expect(await bench.saved.restore()).toBe(false)
    // Discarded, never migrated: a record of an unknown shape is not something this build can reason
    // about field by field.
    expect(bench.workspace.openTypeIds.value).toEqual([])
  })

  test('a record of a foreign version is put aside, not erased', async () => {
    const storage = new MemoryStorage()
    const foreign = JSON.stringify({ v: WORKSPACE_VERSION + 1, workspace: { activeTypeId: 'notes', types: [] } })
    storage.setItem(WORKSPACE_KEY, foreign)
    const bench = build(storage)

    await bench.saved.restore()

    // Rolling back to a previous build and forward again erased the desk twice and without a trace:
    // it could not be read, and the first save overwrote it.
    expect(storage.getItem(WORKSPACE_BACKUP_KEY)).toBe(foreign)
  })

  test('accepting a record is all or nothing: half a rejected one does not survive', async () => {
    const storage = new MemoryStorage()
    storage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({
        v: WORKSPACE_VERSION,
        // The desk is malformed, and the columns beside it are whole and tempting.
        workspace: { activeTypeId: 'notes', types: 'not an array' },
        nav: { notes: { expanded: ['/'] } },
        column: { notes: { width: 320 } },
      }),
    )
    const bench = build(storage)

    expect(await bench.saved.restore()).toBe(false)
    // Nothing from the rejected record may settle in memory and ride back out to disk.
    expect(bench.saved.columnOf('notes')).toEqual({})
    expect(bench.saved.navOf('notes')).toBeNull()
  })

  test('a broken record is the same: start-up does not depend on it', async () => {
    const storage = new MemoryStorage()
    storage.setItem(WORKSPACE_KEY, '{this is not json')
    const bench = build(storage)

    expect(await bench.saved.restore()).toBe(false)
    expect(bench.workspace.openTypeIds.value).toEqual([])
  })

  test('storage being unavailable means working without a memory, not failing', async () => {
    const registry = new TabTypeRegistry()
    registry.register(notesType())
    let saved: WorkspaceStorage
    const workspace = new Workspace({
      types: registry,
      createPanels: () => new FakePanelHost(),
      emit: (event, payload) => saved.observe(event, payload),
    })
    saved = new WorkspaceStorage({ workspace, storage: new BrokenStorage() })

    expect(await saved.restore()).toBe(false)
    await expect(workspace.openObject('notes', { id: 'a.md' })).resolves.toMatchObject({ key: 'note:a.md' })
    expect(() => saved.setColumn('notes', { width: 300 })).not.toThrow()
    expect(() => saved.forget()).not.toThrow()
  })

  test('forgetting the desk erases the record whole', async () => {
    const bench = build()
    await bench.workspace.openObject('notes', { id: 'a.md' })

    bench.saved.forget()
    expect(bench.storage.getItem(WORKSPACE_KEY)).toBeNull()
  })
})

describe('WorkspaceStorage: a layer has nowhere to go', () => {
  test('a layer in the record is not read: it does not reach the app and is not written back', async () => {
    const storage = new MemoryStorage()
    storage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({
        v: WORKSPACE_VERSION,
        workspace: {
          activeTypeId: 'notes',
          types: [{ id: 'notes', activeKey: 'note:a.md', tabs: [{ key: 'note:a.md', title: 'a.md', object: { path: 'a.md' } }] }],
          // A dialog someone hoped would come back. `restore` reads `activeTypeId` and `types` by
          // name, so this is not "ignored by policy" — there is no code path that could read it.
          dialog: { id: 'rename', path: 'a.md' },
        },
        nav: {},
        column: {},
        sheet: { open: true },
        toasts: [{ text: 'saved' }],
      }),
    )
    const bench = build(storage)

    expect(await bench.saved.restore()).toBe(true)
    expect(bench.workspace.tabsOf('notes').map((it) => it.key)).toEqual(['note:a.md'])

    bench.saved.save()
    const written = record(storage)
    expect(Object.keys(written).sort()).toEqual(['column', 'nav', 'v', 'workspace'])
    expect(Object.keys(written.workspace as object).sort()).toEqual(['activeTypeId', 'types'])
  })

  test('the shape is closed all the way down: a type is tabs and a layout, a tab is a key, a title and a snapshot', async () => {
    const bench = build()
    await bench.workspace.openObject('notes', { id: 'a.md' })
    bench.workspace.activateType('settings')

    const state = record(bench.storage).workspace as { types: Array<Record<string, unknown>> }
    // No slot at any level is left over for something that is open on top of the desk rather than
    // being the desk.
    for (const type of state.types) {
      expect(Object.keys(type).sort()).toEqual(['activeKey', 'id', 'tabs'])
      for (const tab of type.tabs as Array<Record<string, unknown>>) {
        expect(Object.keys(tab).sort()).toEqual(['key', 'object', 'title'])
      }
    }
  })
})
