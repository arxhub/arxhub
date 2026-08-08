import { createEventBus, type EventMap } from '@arxhub/events'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { createPanelStore } from '../panel-store'
import { restoreAndPersistWorkspace } from '../workspace-persistence'

const KEY = 'arxhub.panels.workspace'
const EDITOR = 'test.editor'

// This package's tests run under Node, not jsdom — there is no global `localStorage`. The production
// code already tolerates that (use-rail-width.ts's pattern: feature-detect, degrade quietly); this
// fake exists only so the persistence behavior itself is testable here, without pulling a DOM
// environment into a package that otherwise has no use for one.
function fakeLocalStorage(): Storage {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size
    },
  }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: Storage }).localStorage = fakeLocalStorage()
  vi.useFakeTimers()
})

describe('restoreAndPersistWorkspace', () => {
  test('restores a previously-saved snapshot into the store', () => {
    const seed = createPanelStore(createEventBus<EventMap>())
    seed.registerPanel({ id: EDITOR, title: 'Editor', component: defineComponent({}) })
    seed.openPanel(EDITOR, { path: 'notes/a.md' }, 'a.md')
    localStorage.setItem(KEY, JSON.stringify(seed.serialize()))

    const store = createPanelStore(createEventBus<EventMap>())
    restoreAndPersistWorkspace(store)

    expect(store.layout.value).toEqual(seed.layout.value)
  })

  test('a corrupt snapshot is dropped instead of throwing during boot', () => {
    localStorage.setItem(KEY, '{not json')

    const store = createPanelStore(createEventBus<EventMap>())
    expect(() => restoreAndPersistWorkspace(store)).not.toThrow()
    expect(store.layout.value).toBeNull()
  })

  test('no saved snapshot leaves a fresh, empty workspace', () => {
    const store = createPanelStore(createEventBus<EventMap>())
    restoreAndPersistWorkspace(store)

    expect(store.layout.value).toBeNull()
    expect(store.groups.value).toEqual({})
  })

  test('a later change is persisted, debounced, so a restart picks it up', async () => {
    const store = createPanelStore(createEventBus<EventMap>())
    store.registerPanel({ id: EDITOR, title: 'Editor', component: defineComponent({}) })
    restoreAndPersistWorkspace(store)

    store.openPanel(EDITOR, { path: 'notes/a.md' }, 'a.md')
    await nextTick()
    expect(localStorage.getItem(KEY)).toBeNull() // not yet — still inside the debounce window

    vi.advanceTimersByTime(500)
    const saved = localStorage.getItem(KEY)
    expect(saved).not.toBeNull()
    expect(JSON.parse(saved as string).layout).toEqual(store.layout.value)
  })

  test('a burst of changes writes once, not once per change', async () => {
    const store = createPanelStore(createEventBus<EventMap>())
    store.registerPanel({ id: EDITOR, title: 'Editor', component: defineComponent({}) })
    restoreAndPersistWorkspace(store)

    const setItem = vi.spyOn(localStorage, 'setItem')
    store.openPanel(EDITOR, { path: 'notes/a.md' }, 'a.md')
    await nextTick()
    store.openPanel(EDITOR, { path: 'notes/b.md' }, 'b.md')
    await nextTick()
    store.openPanel(EDITOR, { path: 'notes/c.md' }, 'c.md')
    await nextTick()

    vi.advanceTimersByTime(500)

    expect(setItem).toHaveBeenCalledTimes(1)
  })
})
