import { describe, expect, test } from 'vitest'
import { type Component, ref } from 'vue'
import { type StatusBusy, StatusRegistry } from '../ui/status'

const SyncFooter = { name: 'sync' } as Component
const SaveButton = { name: 'save' } as Component
const PlayerFooter = { name: 'player' } as Component

describe('the grammar of status: kind instead of region', () => {
  test('a plugin says WHAT it contributes, not WHERE to put it', () => {
    const status = new StatusRegistry()
    status.register({ id: 'sync', kind: 'status', component: SyncFooter })
    status.register({ id: 'save', kind: 'action', component: SaveButton })

    expect(status.statuses.value.map((it) => it.id)).toEqual(['sync'])
    expect(status.actions.value.map((it) => it.id)).toEqual(['save'])
    // One registration is laid out three ways — the desktop status bar, the status block of the
    // search sheet, and the background line — and the plugin sees none of the three.
    expect(status.all.value.map((it) => it.id)).toEqual(['sync', 'save'])
  })

  test('order decides the order, and at equal order the registration order is kept', () => {
    const status = new StatusRegistry()
    status.register({ id: 'last', kind: 'status', component: SyncFooter, order: 20 })
    status.register({ id: 'first', kind: 'status', component: SyncFooter, order: 10 })
    status.register({ id: 'plain', kind: 'status', component: SyncFooter })

    expect(status.all.value.map((it) => it.id)).toEqual(['plain', 'first', 'last'])
  })

  test('a second registration of an id is ignored, and the fact is reported', () => {
    const warnings: string[] = []
    const status = new StatusRegistry((message) => warnings.push(message))
    status.register({ id: 'sync', kind: 'status', component: SyncFooter })
    status.register({ id: 'sync', kind: 'action', component: SaveButton })

    expect(status.all.value).toHaveLength(1)
    expect(status.all.value[0].kind).toBe('status')
    expect(warnings).toHaveLength(1)
  })

  test('unregister removes an item', () => {
    const status = new StatusRegistry()
    status.register({ id: 'sync', kind: 'status', component: SyncFooter })
    status.unregister('sync')

    expect(status.all.value).toEqual([])
  })

  test('the component comes back as the same object', () => {
    const status = new StatusRegistry()
    status.register({ id: 'sync', kind: 'status', component: SyncFooter })

    expect(status.all.value[0].component).toBe(SyncFooter)
  })
})

describe('the background line is a projection of the status items', () => {
  test('while nothing is busy there is no line at all', () => {
    const status = new StatusRegistry()
    status.register({ id: 'sync', kind: 'status', component: SyncFooter, busy: () => null })
    status.register({ id: 'save', kind: 'action', component: SaveButton })

    expect(status.busy.value).toEqual([])
  })

  test('busyness is shown by the same item, not by a second registration', () => {
    const status = new StatusRegistry()
    // Busyness has to live in a reactive value: the line is a projection, and it updates exactly when
    // what the item says about itself updates.
    const work = ref<StatusBusy | null>(null)
    status.register({ id: 'sync', kind: 'status', component: SyncFooter, busy: () => work.value })

    work.value = { label: 'Syncing', progress: 0.4 }
    expect(status.busy.value).toEqual([{ id: 'sync', label: 'Syncing', progress: 0.4 }])

    work.value = null
    expect(status.busy.value).toEqual([])
  })

  test('work with an owner has somewhere to lead, work without one honestly has nowhere', () => {
    const status = new StatusRegistry()
    status.register({
      id: 'player',
      kind: 'status',
      component: PlayerFooter,
      busy: () => ({ label: 'Playing: Coffee', owner: { typeId: 'player', objectKey: 'track:7' } }),
    })
    status.register({ id: 'index', kind: 'status', component: SyncFooter, busy: () => ({ label: 'Building the index' }) })

    const [playing, indexing] = status.busy.value
    expect(playing.owner).toEqual({ typeId: 'player', objectKey: 'track:7' })
    expect(indexing.owner).toBeUndefined()
  })

  test('the line keeps the order of the status items: it is their projection, not a list of its own', () => {
    const status = new StatusRegistry()
    status.register({ id: 'second', kind: 'status', component: SyncFooter, order: 20, busy: () => ({ label: 'Second' }) })
    status.register({ id: 'first', kind: 'action', component: SaveButton, order: 10, busy: () => ({ label: 'First' }) })

    expect(status.busy.value.map((it) => it.id)).toEqual(['first', 'second'])
  })
})
