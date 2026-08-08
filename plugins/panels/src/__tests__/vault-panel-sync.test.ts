import { createEventBus, type EventMap } from '@arxhub/events'
import { beforeEach, describe, expect, test } from 'vitest'
import { defineComponent } from 'vue'
import { createPanelStore } from '../panel-store'
import type { PanelStore } from '../types'
import { applyVaultChangeToPanels } from '../vault-panel-sync'

const EDITOR = 'test.editor'

let store: PanelStore

beforeEach(() => {
  store = createPanelStore(createEventBus<EventMap>())
  store.registerPanel({ id: EDITOR, title: 'Editor', component: defineComponent({}) })
})

function open(path: string, groupId?: string): string {
  return store.openPanel(EDITOR, { path }, path.split('/').pop(), groupId)
}

function findInstance(instanceId: string) {
  for (const group of Object.values(store.groups.value)) {
    const instance = group.instances.find((i) => i.instanceId === instanceId)
    if (instance) return instance
  }
  return undefined
}

describe('applyVaultChangeToPanels', () => {
  test('a delete closes the panel showing that path', () => {
    const instanceId = open('notes/todo.md')
    const groupId = store.activeGroupId.value as string

    const closed = applyVaultChangeToPanels(store, { kind: 'deleted', pathname: 'notes/todo.md' })

    expect(closed).toBe(true)
    expect(store.groups.value[groupId]).toBeUndefined()
    expect(findInstance(instanceId)).toBeUndefined()
  })

  test('a delete closes every panel showing that path, even split across groups', () => {
    const first = open('notes/todo.md')
    const firstGroupId = store.activeGroupId.value as string
    const secondGroupId = store.splitGroup(firstGroupId, 'horizontal')
    const second = store.openPanel(EDITOR, { path: 'notes/todo.md' }, 'todo.md', secondGroupId)

    const closed = applyVaultChangeToPanels(store, { kind: 'deleted', pathname: 'notes/todo.md' })

    expect(closed).toBe(true)
    expect(findInstance(first)).toBeUndefined()
    expect(findInstance(second)).toBeUndefined()
    expect(store.groups.value[firstGroupId]).toBeUndefined()
    expect(store.groups.value[secondGroupId]).toBeUndefined()
  })

  test('a rename retargets the panel path and title in place, without closing it', () => {
    const instanceId = open('notes/todo.md')
    const groupId = store.activeGroupId.value as string

    const closed = applyVaultChangeToPanels(store, { kind: 'renamed', pathname: 'notes/done.md', from: 'notes/todo.md' })

    expect(closed).toBe(false)
    // Same instanceId, same group, same panel count — a rename never remounts, it only relabels.
    const group = store.groups.value[groupId]
    expect(group?.instances).toHaveLength(1)
    const instance = findInstance(instanceId)
    expect(instance?.props?.path).toBe('notes/done.md')
    expect(instance?.title).toBe('done.md')
  })

  test('a delete does not touch a panel at an unrelated path', () => {
    const instanceId = open('notes/keep.md')

    const closed = applyVaultChangeToPanels(store, { kind: 'deleted', pathname: 'notes/other.md' })

    expect(closed).toBe(false)
    expect(findInstance(instanceId)?.props?.path).toBe('notes/keep.md')
  })

  test('a rename does not touch a panel at an unrelated path', () => {
    const instanceId = open('notes/keep.md')

    const closed = applyVaultChangeToPanels(store, { kind: 'renamed', pathname: 'notes/moved.md', from: 'notes/other.md' })

    expect(closed).toBe(false)
    const instance = findInstance(instanceId)
    expect(instance?.props?.path).toBe('notes/keep.md')
    expect(instance?.title).toBe('keep.md')
  })

  test('a write is a no-op — panels only react to a document disappearing or moving', () => {
    const instanceId = open('notes/keep.md')

    const closed = applyVaultChangeToPanels(store, { kind: 'written', pathname: 'notes/keep.md' })

    expect(closed).toBe(false)
    expect(findInstance(instanceId)?.props?.path).toBe('notes/keep.md')
  })
})
