import { afterEach, expect, test, vi } from 'vitest'
import { effectScope, nextTick, shallowRef } from 'vue'
import type { TreeViewNode } from '../core/tree-view'
import { useTreeNavigation } from '../hooks/useTreeNavigation'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
})
const node = (id: string, extra: Partial<TreeViewNode<string>> = {}): TreeViewNode<string> => ({ id, label: id, data: id, ...extra })
const key = (value: string) => ({ key: value, preventDefault: vi.fn() }) as unknown as KeyboardEvent

test('lazy branches load on Right, skip disabled rows, and preserve parent navigation', async () => {
  const nodes = shallowRef([node('folder', { branch: true }), node('disabled', { disabled: true }), node('last')])
  const expandedIds = shallowRef<string[]>([])
  const focus = vi.fn()
  const toggle = vi.fn()
  const activate = vi.fn()
  const scope = effectScope()
  scopes.push(scope)
  const tree = scope.run(() => useTreeNavigation({ nodes, expandedIds, focus, toggle, activate }))!
  tree.onKeydown(key('ArrowRight'))
  expect(toggle).toHaveBeenCalledWith(nodes.value[0], true)
  expect(tree.focusedId.value).toBe('folder')
  nodes.value = [node('folder', { children: [node('child')] }), nodes.value[1], nodes.value[2]]
  expandedIds.value = ['folder']
  await nextTick()
  tree.onKeydown(key('ArrowRight'))
  expect(focus).toHaveBeenLastCalledWith('child')
  tree.onKeydown(key('ArrowLeft'))
  expect(focus).toHaveBeenLastCalledWith('folder')
  tree.onKeydown(key('End'))
  expect(focus).toHaveBeenLastCalledWith('last')
  tree.onKeydown(key('ArrowUp'))
  expect(focus).toHaveBeenLastCalledWith('child')
  tree.onKeydown(key('Enter'))
  expect(activate).toHaveBeenLastCalledWith(nodes.value[0].children![0])
  tree.onKeydown(key('Home'))
  tree.onKeydown(key('ArrowLeft'))
  expect(toggle).toHaveBeenLastCalledWith(nodes.value[0], false)
})

test('hidden descendants recover to their ancestor without stealing focus from another control', async () => {
  const nodes = shallowRef([node('folder', { children: [node('child')] }), node('other')])
  const expandedIds = shallowRef(['folder'])
  const focus = vi.fn()
  const shouldRestoreFocus = vi.fn(() => true)
  const scope = effectScope()
  scopes.push(scope)
  const tree = scope.run(() => useTreeNavigation({ nodes, expandedIds, focus, shouldRestoreFocus, toggle: vi.fn(), activate: vi.fn() }))!
  tree.focusedId.value = 'child'
  expandedIds.value = []
  await nextTick()
  await nextTick()
  expect(tree.focusedId.value).toBe('folder')
  expect(focus).toHaveBeenLastCalledWith('folder')
  focus.mockClear()
  shouldRestoreFocus.mockReturnValue(false)
  nodes.value = [node('other')]
  await nextTick()
  await nextTick()
  expect(tree.focusedId.value).toBe('other')
  expect(focus).not.toHaveBeenCalled()
  nodes.value = []
  await nextTick()
  expect(tree.focusedId.value).toBeNull()
})
