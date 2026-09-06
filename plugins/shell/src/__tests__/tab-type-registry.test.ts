import { describe, expect, test } from 'vitest'
import type { Component } from 'vue'
import { isObjectType, isPinned, type ObjectsRole, type TabType } from '../ui/tab-type'
import { TabTypeRegistry } from '../ui/tab-type-registry'

const Content = { name: 'content' } as Component
const Nav = { name: 'nav' } as Component

const objects: ObjectsRole = {
  open: () => Promise.reject(new Error('not needed in these tests')),
  revive: () => Promise.reject(new Error('not needed in these tests')),
  label: (object) => ({ title: object.title }),
}

function contentType(id: string, extra: Partial<TabType> = {}): TabType {
  return { id, icon: 'lu:file', title: id, content: Content, ...extra } as TabType
}

function objectType(id: string, extra: Partial<TabType> = {}): TabType {
  return { id, icon: 'lu:file', title: id, objects, ...extra } as TabType
}

describe('the tab-type registry', () => {
  test('a registered type is found by id, an unknown one is not', () => {
    const registry = new TabTypeRegistry()
    registry.register(contentType('logs'))

    expect(registry.get('logs')?.title).toBe('logs')
    expect(registry.has('logs')).toBe(true)
    expect(registry.get('unknown')).toBeUndefined()
    expect(registry.has('unknown')).toBe(false)
  })

  test('the row is ordered by order, and at equal order the registration order is kept', () => {
    const registry = new TabTypeRegistry()
    registry.register(contentType('third', { order: 30 }))
    registry.register(contentType('first', { order: 10 }))
    registry.register(contentType('second-a', { order: 20 }))
    registry.register(contentType('second-b', { order: 20 }))

    expect(registry.all.value.map((it) => it.id)).toEqual(['first', 'second-a', 'second-b', 'third'])
  })

  test('a type without an order stands ahead of types with a positive one — a registration need not name it', () => {
    const registry = new TabTypeRegistry()
    registry.register(contentType('ordered', { order: 5 }))
    registry.register(contentType('plain'))

    expect(registry.all.value.map((it) => it.id)).toEqual(['plain', 'ordered'])
  })

  test('pinned defaults to true; pinned: false leaves the row but stays in the registry', () => {
    const registry = new TabTypeRegistry()
    registry.register(contentType('notes'))
    registry.register(contentType('logs', { pinned: false }))

    expect(registry.pinned.value.map((it) => it.id)).toEqual(['notes'])
    // Reachability: an unpinned type has to be visible to the search sheet, or it is unreachable by
    // construction — exactly the mistake that `hidden` used to make.
    expect(registry.all.value.map((it) => it.id)).toEqual(['notes', 'logs'])
    expect(isPinned(registry.get('logs') as TabType)).toBe(false)
  })

  test('a second registration of the same id is ignored, the first stays, and the fact is reported', () => {
    const warnings: string[] = []
    const registry = new TabTypeRegistry((message) => warnings.push(message))
    registry.register(contentType('notes', { title: 'Notes' }))
    registry.register(contentType('notes', { title: 'Impostor' }))

    expect(registry.all.value).toHaveLength(1)
    expect(registry.get('notes')?.title).toBe('Notes')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('notes')
  })

  test('unregister removes a type', () => {
    const registry = new TabTypeRegistry()
    registry.register(contentType('notes'))
    registry.unregister('notes')

    expect(registry.has('notes')).toBe(false)
    expect(registry.all.value).toEqual([])
  })

  test('components come back as the same objects — the registry does not wrap them in a reactive proxy', () => {
    const registry = new TabTypeRegistry()
    registry.register(contentType('notes', { nav: { component: Nav, title: 'Files' } }))

    const type = registry.get('notes') as TabType
    expect(type.content).toBe(Content)
    expect(type.nav?.component).toBe(Nav)
  })

  test('objects and content are told apart by a predicate, not by a flag', () => {
    const registry = new TabTypeRegistry()
    registry.register(objectType('notes'))
    registry.register(contentType('logs'))

    const notes = registry.get('notes') as TabType
    const logs = registry.get('logs') as TabType
    expect(isObjectType(notes)).toBe(true)
    expect(isObjectType(logs)).toBe(false)
    // The role comes back as the one that was registered: Workspace is going to call its methods.
    expect(isObjectType(notes) && notes.objects).toBe(objects)
  })

  test('all is reactive: the row repaints when a plugin registers its type later', () => {
    const registry = new TabTypeRegistry()
    const seen: number[] = []
    // computed is lazy — read it the way a render does.
    seen.push(registry.all.value.length)
    registry.register(contentType('notes'))
    seen.push(registry.all.value.length)

    expect(seen).toEqual([0, 1])
  })
})
