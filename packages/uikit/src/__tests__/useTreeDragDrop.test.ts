import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/vue'
import { afterEach, expect, test, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import type { TreeViewNode } from '../core/tree-view'
import { useTreeDragDrop } from '../hooks/useTreeDragDrop'

const leaf = (id: string): TreeViewNode => ({ id, label: id, data: null })
function setup() {
  const nested = leaf('nested')
  const child = { ...leaf('child'), branch: true }
  const folder = { ...leaf('folder'), branch: true, children: [nested, child] }
  const other = { ...leaf('other'), branch: true }
  const nodes = ref([folder, other])
  const drop = vi.fn()
  const expand = vi.fn()
  const scope = effectScope()
  const dnd = scope.run(() => useTreeDragDrop({ nodes, expandedIds: [], config: { rootLabel: 'Root' }, drop, expand }))!
  // These policy tests omit dnd-kit geometry/sensors, which the handlers do not read.
  const start = (id: string) => dnd.onDragStart({ operation: { source: { data: { nodeId: id } } } } as unknown as DragStartEvent)
  const over = (id: string | null) => dnd.onDragOver({ operation: { target: { data: { nodeId: id } } } } as unknown as DragOverEvent)
  const end = (id: string | null, canceled = false) =>
    dnd.onDragEnd({ canceled, operation: { target: { data: { nodeId: id } } } } as unknown as DragEndEvent)
  return { dnd, start, over, end, folder, child, nested, other, nodes, drop, expand, scope }
}
afterEach(() => vi.useRealTimers())

test('tree drop rejects self, descendants and unchanged parent but allows another branch and root', () => {
  const t = setup()
  t.start('folder')
  expect(t.dnd.canDrop(t.folder)).toBe(false)
  expect(t.dnd.canDrop(t.child)).toBe(false)
  expect(t.dnd.canDrop(null)).toBe(false)
  expect(t.dnd.canDrop(t.other)).toBe(true)
  t.start('nested')
  expect(t.dnd.canDrop(t.folder)).toBe(false)
  expect(t.dnd.canDrop(null)).toBe(true)
  t.end(null)
  expect(t.drop).toHaveBeenCalledWith(t.nested, null)
  t.scope.stop()
})

test('hover expands once, leaving or cancelling clears the pending expansion', () => {
  vi.useFakeTimers()
  const t = setup()
  t.start('nested')
  t.over('other')
  vi.advanceTimersByTime(300)
  t.end('other', true)
  vi.advanceTimersByTime(1000)
  expect(t.expand).not.toHaveBeenCalled()
  expect(t.drop).not.toHaveBeenCalled()
  t.start('nested')
  t.over('other')
  vi.advanceTimersByTime(600)
  expect(t.expand).toHaveBeenCalledExactlyOnceWith(t.other)
  t.over('child')
  t.scope.stop()
  vi.advanceTimersByTime(1000)
  expect(t.expand).toHaveBeenCalledTimes(1)
})

test('a source removed during a drag is never dropped from its stale snapshot', () => {
  const t = setup()
  t.start('nested')
  t.nodes.value = [t.other]
  t.end('other')
  expect(t.drop).not.toHaveBeenCalled()
  expect(t.dnd.source.value).toBeNull()
  t.scope.stop()
})
