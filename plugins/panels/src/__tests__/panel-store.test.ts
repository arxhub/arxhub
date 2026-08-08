import { createEventBus, type EventMap } from '@arxhub/events'
import { beforeEach, describe, expect, test } from 'vitest'
import { defineComponent } from 'vue'
import { createPanelStore } from '../panel-store'
import type { LayoutSplit, PanelStore } from '../types'

// Covers the store mutations the keyboard paths added to ResizeHandle and DraggableTab call:
// setRatio (the resize-handle Arrow-key nudge), movePanel (the tab "move left/right" and
// "move to next/previous split" actions) and getOrderedGroupIds (how those actions find a neighbour).

const EDITOR = 'test.editor'

let store: PanelStore

beforeEach(() => {
  store = createPanelStore(createEventBus<EventMap>())
  store.registerPanel({ id: EDITOR, title: 'Editor', component: defineComponent({}) })
})

function open(path: string, groupId?: string): string {
  return store.openPanel(EDITOR, { path }, path.split('/').pop(), groupId)
}

function requireSplit(): LayoutSplit {
  const node = store.layout.value
  if (!node || node.type !== 'split') throw new Error('expected the layout to be a split')
  return node
}

describe('setRatio', () => {
  function openSplitGroup(): void {
    open('notes/a.md')
    const groupId = store.activeGroupId.value as string
    store.splitGroup(groupId, 'horizontal')
  }

  test('updates the ratio of the split with the given id', () => {
    openSplitGroup()
    const split = requireSplit()

    store.setRatio(split.splitId, 0.7)

    expect(requireSplit().ratio).toBeCloseTo(0.7)
  })

  test('clamps below the 0.1 floor', () => {
    openSplitGroup()
    const split = requireSplit()

    store.setRatio(split.splitId, -0.5)

    expect(requireSplit().ratio).toBeCloseTo(0.1)
  })

  test('clamps above the 0.9 ceiling', () => {
    openSplitGroup()
    const split = requireSplit()

    store.setRatio(split.splitId, 1.5)

    expect(requireSplit().ratio).toBeCloseTo(0.9)
  })

  test('is a no-op for a split id that does not exist', () => {
    openSplitGroup()
    const before = requireSplit().ratio

    store.setRatio('does-not-exist', 0.8)

    expect(requireSplit().ratio).toBe(before)
  })
})

describe('getOrderedGroupIds', () => {
  test('is empty before any panel has opened', () => {
    expect(store.getOrderedGroupIds()).toEqual([])
  })

  test('is the single leaf group once one panel is open', () => {
    open('notes/a.md')
    const groupId = store.activeGroupId.value as string

    expect(store.getOrderedGroupIds()).toEqual([groupId])
  })

  test('lists split groups in tree order, first branch before second', () => {
    open('notes/a.md')
    const firstGroupId = store.activeGroupId.value as string
    const secondGroupId = store.splitGroup(firstGroupId, 'horizontal')
    const thirdGroupId = store.splitGroup(secondGroupId, 'vertical')

    expect(store.getOrderedGroupIds()).toEqual([firstGroupId, secondGroupId, thirdGroupId])
  })
})

describe('movePanel reordering within one group (the tab "move left" / "move right" actions)', () => {
  function openThreeInOneGroup(): { groupId: string; a: string; b: string; c: string } {
    const a = open('notes/a.md')
    const groupId = store.activeGroupId.value as string
    const b = open('notes/b.md', groupId)
    const c = open('notes/c.md', groupId)
    return { groupId, a, b, c }
  }

  test('move left swaps a tab with its left neighbour', () => {
    const { groupId, a, b, c } = openThreeInOneGroup()
    const indexOfB = store.groups.value[groupId]?.instances.findIndex((i) => i.instanceId === b) ?? -1

    store.movePanel(b, groupId, groupId, indexOfB - 1)

    expect(store.groups.value[groupId]?.instances.map((i) => i.instanceId)).toEqual([b, a, c])
  })

  test('move right swaps a tab with its right neighbour', () => {
    const { groupId, a, b, c } = openThreeInOneGroup()
    const indexOfB = store.groups.value[groupId]?.instances.findIndex((i) => i.instanceId === b) ?? -1

    store.movePanel(b, groupId, groupId, indexOfB + 2)

    expect(store.groups.value[groupId]?.instances.map((i) => i.instanceId)).toEqual([a, c, b])
  })

  test('is a no-op when the target index leaves the order unchanged', () => {
    const { groupId, a, b, c } = openThreeInOneGroup()
    const before = store.groups.value[groupId]?.instances.map((i) => i.instanceId)

    // toIndex === srcIndex and toIndex === srcIndex + 1 both describe "stay put" per movePanel's
    // insertion-point semantics.
    store.movePanel(a, groupId, groupId, 0)
    store.movePanel(b, groupId, groupId, 2)

    expect(store.groups.value[groupId]?.instances.map((i) => i.instanceId)).toEqual(before)
    expect(before).toEqual([a, b, c])
  })
})

describe('movePanel across groups (the tab "move to next/previous split" actions)', () => {
  test('appends the tab at the end of the target group and leaves the source group open', () => {
    const a = open('notes/a.md')
    const firstGroupId = store.activeGroupId.value as string
    const b = open('notes/b.md', firstGroupId)
    const secondGroupId = store.splitGroup(firstGroupId, 'horizontal')
    const c = open('notes/c.md', secondGroupId)

    const target = store.groups.value[secondGroupId]
    store.movePanel(b, firstGroupId, secondGroupId, target?.instances.length ?? 0)

    expect(store.groups.value[firstGroupId]?.instances.map((i) => i.instanceId)).toEqual([a])
    expect(store.groups.value[secondGroupId]?.instances.map((i) => i.instanceId)).toEqual([c, b])
  })

  test('closes the source group once its last tab moves out, and getOrderedGroupIds drops it', () => {
    const a = open('notes/a.md')
    const firstGroupId = store.activeGroupId.value as string
    const secondGroupId = store.splitGroup(firstGroupId, 'horizontal')
    open('notes/b.md', secondGroupId)

    store.movePanel(a, firstGroupId, secondGroupId, 0)

    expect(store.groups.value[firstGroupId]).toBeUndefined()
    expect(store.getOrderedGroupIds()).toEqual([secondGroupId])
  })
})
